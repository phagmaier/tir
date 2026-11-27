//! One Tir at a time for each settings file, and so for its library: a
//! second Tir would show the same draft, and whichever held the older
//! script would save it over the other's newer work. A trial run with its
//! own `TIR_CONFIG_DIR` has its own settings and library, and runs beside.

use std::fs::{self, File, TryLockError};
use std::io;
use std::path::Path;

/// Held while Tir runs: a lock on Tir's config directory, which the system
/// lets go when the process ends, however it ends.
pub struct Instance {
    _lock: File,
}

/// Locks `dir`, made if need be; `None` when another Tir holds it.
pub fn claim(dir: &Path) -> io::Result<Option<Instance>> {
    fs::create_dir_all(dir)?;
    let lock = File::open(dir)?;
    match lock.try_lock() {
        Ok(()) => Ok(Some(Instance { _lock: lock })),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(error)) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::TempDir;

    #[test]
    fn one_tir_at_a_time_for_each_config_directory() {
        let dir = TempDir::new();
        let config = dir.0.join("dev.tir.desktop");
        let first = claim(&config).unwrap().expect("the first Tir runs");
        assert!(claim(&config).unwrap().is_none());
        // A trial run's directory is its own.
        assert!(claim(&dir.0.join("trial")).unwrap().is_some());
        drop(first);
        assert!(claim(&config).unwrap().is_some());
    }
}
