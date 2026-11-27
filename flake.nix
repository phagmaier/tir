{
  description = "Tir development shell: the system libraries Tauri needs on Linux";

  # Runtimes (Node, pnpm, Rust) come from mise.toml, not from here.
  # flake.lock pins the same nixpkgs revision as the user's NixOS system, so
  # WebKitGTK's Mesa matches the system's graphics driver.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.11";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        # Following the NixOS wiki's Tauri page and Tauri's Linux prerequisites.
        nativeBuildInputs = with pkgs; [
          pkg-config
          wrapGAppsHook3
        ];
        buildInputs = with pkgs; [
          webkitgtk_4_1
          gtk3
          libsoup_3
          glib
          glib-networking
          gsettings-desktop-schemas
          librsvg
          openssl
          xdotool
        ];
        shellHook = ''
          # mise's dev and check tasks enter this shell unless they see this.
          export TIR_DEV_SHELL=1
          # GTK needs the schemas to report Wayland's display scale and to
          # open file dialogs; keep the desktop's own data directories too.
          export XDG_DATA_DIRS="$GSETTINGS_SCHEMAS_PATH''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
          export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"
          # Rust links with its bundled LLD by default, which bypasses this
          # shell's linker wrapper, so the binary would not record where GTK
          # and WebKit live (docs/findings.md, "NixOS development shell").
          export RUSTFLAGS="-Clinker-features=-lld''${RUSTFLAGS:+ $RUSTFLAGS}"
        '';
      };
    };
}
