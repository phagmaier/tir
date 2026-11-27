//! Closing the window saves first (architecture, "Saving and opening").
//! Once the page can save, it takes closing over (`hold_close`): from then
//! a request to close the window is held and passed to the page as
//! `tir://close`, and the page closes the window (`close_window`) once the
//! script is saved, or once the writer chose to close after a save failed.
//! A page that never answers, hung or gone, cannot keep the window open
//! for ever: a request made `PATIENCE` or more after the first one held
//! closes it.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{Emitter, Runtime, State, WebviewWindow, Window};

/// Longer than any save takes; the page's own message box may outlast it.
const PATIENCE: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct Closing(Mutex<Held>);

#[derive(Default, Debug, PartialEq)]
struct Held {
    /// The page saves before the window closes.
    by_page: bool,
    /// When a request to close was first held, since the page last took
    /// closing over.
    since: Option<Instant>,
}

impl Held {
    /// Whether a request to close, made `now`, is held for the page.
    fn hold(&mut self, now: Instant) -> bool {
        if !self.by_page {
            return false;
        }
        let since = *self.since.get_or_insert(now);
        now.duration_since(since) < PATIENCE
    }
}

impl Closing {
    fn held(&self) -> MutexGuard<'_, Held> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Whether to keep `window` open on a request to close it: then the
    /// page is asked to save and close it.
    pub fn hold<R: Runtime>(&self, window: &Window<R>) -> bool {
        let hold = self.held().hold(Instant::now());
        if hold {
            // Again on each request, for a page that missed one while loading.
            let _ = window.emit("tir://close", ());
        }
        hold
    }
}

/// The page saves before the window closes, and closes it itself; also
/// after the writer kept Tir open when a save on closing failed.
#[tauri::command]
pub fn hold_close(closing: State<'_, Closing>) {
    *closing.held() = Held {
        by_page: true,
        since: None,
    };
}

/// Closes the window, which the page has saved.
#[tauri::command]
pub fn close_window(window: WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holds_a_request_for_the_page_until_it_has_waited_long_enough() {
        let start = Instant::now();
        let mut held = Held::default();
        // Before the page takes closing over, the window closes at once.
        assert!(!held.hold(start));
        assert_eq!(held, Held::default());

        held.by_page = true;
        assert!(held.hold(start));
        assert!(held.hold(start + Duration::from_millis(4_900)));
        // The page has not closed the window: a request now closes it.
        assert!(!held.hold(start + PATIENCE));

        // Kept open by the writer, the page holds closing again afresh.
        let later = start + Duration::from_secs(60);
        held.since = None;
        assert!(held.hold(later));
        assert!(held.hold(later + Duration::from_secs(1)));
    }
}
