//! The repository the library backs up to (architecture, "Backup"): its
//! address on GitHub, and whether anyone without a login can read it.
//! Whether a repository is public is asked of GitHub with no login at all,
//! so it needs no token: GitHub's REST API answers a request with none with
//! the repository when it is public, and "404 Not Found" when it is private
//! or missing (findings, "GitHub").

use crate::git::{Error, Git};
use std::path::Path;

/// A repository on GitHub, and how this machine's git reaches it.
#[derive(Debug, PartialEq)]
pub struct Address {
    pub owner: String,
    pub name: String,
    /// Over ssh, rather than HTTPS.
    pub ssh: bool,
}

impl Address {
    /// The address GitHub gives a repository for reading over HTTPS.
    pub fn https(&self) -> String {
        format!("https://github.com/{}/{}.git", self.owner, self.name)
    }

    /// The address Tir gives git: the one pasted, in GitHub's own form, so
    /// nothing but the repository's names comes from what was pasted.
    pub fn url(&self) -> String {
        if self.ssh {
            format!("git@github.com:{}/{}.git", self.owner, self.name)
        } else {
            self.https()
        }
    }
}

/// The repository an address the writer pasted names, if it is one of
/// GitHub's: `git@github.com:OWNER/NAME.git`, `ssh://git@github.com/…` or
/// `https://github.com/…`, with or without `.git`.
pub fn parse(address: &str) -> Option<Address> {
    let address = address.trim();
    let (path, ssh) = if let Some(path) = address.strip_prefix("git@github.com:") {
        (path, true)
    } else if let Some(path) = address.strip_prefix("ssh://git@github.com/") {
        (path, true)
    } else {
        (address.strip_prefix("https://github.com/")?, false)
    };
    let path = path.strip_suffix('/').unwrap_or(path);
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.split_once('/')?;
    // GitHub's own rules: an owner of letters, digits and hyphens, a name
    // of letters, digits, `.`, `-` and `_`.
    let owner_ok = !owner.is_empty()
        && owner.len() <= 39
        && owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let name_ok = !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    (owner_ok && name_ok).then(|| Address {
        owner: owner.to_owned(),
        name: name.to_owned(),
        ssh,
    })
}

/// What anyone without a login sees of a repository.
#[derive(Debug, PartialEq)]
pub enum Seen {
    /// The repository: it is public.
    Public,
    /// Nothing: it is private, or missing.
    Nothing,
    /// No answer to go by, and why.
    Unknown(String),
}

/// How Tir asks what anyone sees.
pub enum Anonymous {
    /// GitHub's REST API, with no login.
    Api,
    /// In a sandbox, git reading only the configuration given: a repository
    /// is public when git can read its HTTPS address there.
    Sandboxed(Git),
}

/// How long GitHub's API may take to answer, in seconds.
const API_SECONDS: u32 = 20;

impl Anonymous {
    pub fn sees(&self, root: &Path, address: &Address) -> Seen {
        match self {
            Anonymous::Api => {
                let url = format!(
                    "https://api.github.com/repos/{}/{}",
                    address.owner, address.name
                );
                match get(&url) {
                    Ok((status, body)) => answer(status, &body),
                    Err(error) => Seen::Unknown(error),
                }
            }
            Anonymous::Sandboxed(git) => match git.ls_remote(root, &address.https()) {
                Ok(_) => Seen::Public,
                Err(Error::Failed { .. }) => Seen::Nothing,
                Err(error) => Seen::Unknown(error.to_string()),
            },
        }
    }
}

/// What GitHub's API answering `status` with `body` says about the
/// repository asked for with no login.
pub fn answer(status: u32, body: &[u8]) -> Seen {
    match status {
        200 => {
            let private = serde_json::from_slice::<serde_json::Value>(body)
                .ok()
                .and_then(|repository| repository.get("private")?.as_bool());
            match private {
                Some(false) => Seen::Public,
                Some(true) => Seen::Nothing,
                None => Seen::Unknown("GitHub's answer did not say".into()),
            }
        }
        404 => Seen::Nothing,
        403 | 429 => Seen::Unknown("GitHub asked Tir to wait before asking again".into()),
        _ => Seen::Unknown(format!("GitHub answered {status}")),
    }
}

/// GETs `url` with no login: the status and the body.
fn get(url: &str) -> Result<(u32, Vec<u8>), String> {
    use soup::prelude::*;
    let session = soup::Session::new();
    session.set_timeout(API_SECONDS);
    session.set_user_agent("Tir");
    let message = soup::Message::new("GET", url).map_err(|error| error.to_string())?;
    if let Some(headers) = message.request_headers() {
        headers.append("Accept", "application/vnd.github+json");
    }
    let body = session
        .send_and_read(&message, soup::gio::Cancellable::NONE)
        .map_err(|error| error.to_string())?;
    Ok((message.status_code(), body.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// What `pasted` names: owner, name, and whether over ssh.
    fn named(pasted: &str) -> Option<(String, String, bool)> {
        parse(pasted).map(|address| (address.owner, address.name, address.ssh))
    }

    #[test]
    fn reads_the_addresses_github_gives() {
        let ssh = Some(("mara".to_string(), "screenplays".to_string(), true));
        let https = Some(("mara".to_string(), "screenplays".to_string(), false));
        for (pasted, expected) in [
            ("git@github.com:mara/screenplays.git", &ssh),
            ("git@github.com:mara/screenplays", &ssh),
            ("ssh://git@github.com/mara/screenplays.git", &ssh),
            ("https://github.com/mara/screenplays.git", &https),
            ("https://github.com/mara/screenplays", &https),
            ("  https://github.com/mara/screenplays/\n", &https),
        ] {
            assert_eq!(&named(pasted), expected, "{pasted}");
        }
        assert_eq!(
            named("git@github.com:Mara-E/salt_line.v2.git"),
            Some(("Mara-E".into(), "salt_line.v2".into(), true))
        );
        let ssh = parse("ssh://git@github.com/mara/screenplays").unwrap();
        assert_eq!(ssh.url(), "git@github.com:mara/screenplays.git");
        assert_eq!(ssh.https(), "https://github.com/mara/screenplays.git");
        let https = parse("https://github.com/mara/screenplays").unwrap();
        assert_eq!(https.url(), "https://github.com/mara/screenplays.git");
    }

    #[test]
    fn refuses_what_is_no_github_repository() {
        for pasted in [
            "",
            "screenplays",
            "github.com/mara/screenplays",
            "git@gitlab.com:mara/screenplays.git",
            "https://github.com/mara",
            "https://github.com/mara/screenplays/tree/main",
            "https://github.com/../screenplays",
            "git@github.com:mara/..",
            "git@github.com:mara/screen plays.git",
            "https://github.com/mara/screenplays.git?x=1",
            "https://github.com.evil.example/mara/screenplays.git",
            "file:///home/mara/screenplays.git",
            "/home/mara/screenplays.git",
            "ext::sh -c touch% /tmp/x",
        ] {
            assert_eq!(named(pasted), None, "{pasted}");
        }
    }

    #[test]
    fn reads_what_githubs_api_says_with_no_login() {
        // As GitHub's API answers: the repository for a public one, "Not
        // Found" for a private or missing one.
        let public = br#"{"id":1,"name":"screenplays","private":false,"visibility":"public"}"#;
        assert_eq!(answer(200, public), Seen::Public);
        let missing = br#"{"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/repos#get-a-repository","status":"404"}"#;
        assert_eq!(answer(404, missing), Seen::Nothing);
        assert_eq!(answer(200, br#"{"private":true}"#), Seen::Nothing);
        assert!(matches!(answer(200, b"<html>"), Seen::Unknown(_)));
        assert!(matches!(answer(403, b"{}"), Seen::Unknown(_)));
        assert!(matches!(answer(429, b"{}"), Seen::Unknown(_)));
        assert!(matches!(answer(500, b""), Seen::Unknown(_)));
    }
}
