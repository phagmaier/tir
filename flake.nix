{
  description = "Tir desktop release and development shell";

  # Development runtimes come from mise.toml; the release builds with nixpkgs.
  # flake.lock pins the same nixpkgs revision as the user's NixOS system, so
  # WebKitGTK's Mesa matches the system's graphics driver.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.11";

  outputs =
    { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      pnpm = pkgs.pnpm_12.override { nodejs-slim = pkgs.nodejs-slim_24; };
      desktopLibraries = with pkgs; [
        webkitgtk_4_1
        gtk3
        libsoup_3
        glib
        glib-networking
        gsettings-desktop-schemas
        librsvg
        openssl
      ];
      tir = pkgs.rustPlatform.buildRustPackage (finalAttrs: {
        pname = "tir";
        inherit (builtins.fromJSON (builtins.readFile ./package.json)) version;
        src = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.unions [
            ./index.html
            ./package.json
            ./pnpm-lock.yaml
            ./pnpm-workspace.yaml
            ./src
            ./src-tauri
            ./vite.config.ts
            ./tsconfig.json
          ];
        };
        cargoLock.lockFile = ./src-tauri/Cargo.lock;
        cargoRoot = "src-tauri";
        buildAndTestSubdir = finalAttrs.cargoRoot;
        buildFeatures = [ "tauri/custom-protocol" ];
        cargoBuildFlags = [ "--locked" ];
        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (finalAttrs) pname src;
          inherit pnpm;
          fetcherVersion = 5;
          hash = "sha256-UBLxjLm9EClT/HogApRd5edUuDFKOIBGkRAo9Uycw5U=";
        };
        desktopItems = [
          (pkgs.makeDesktopItem {
            # Match the native Wayland class; Tauri's settings identifier is separate.
            name = "tir";
            desktopName = "Tir";
            genericName = "Screenwriting";
            comment = "Write feature-film screenplays";
            exec = "tir";
            icon = "tir";
            terminal = false;
            categories = [
              "Office"
              "WordProcessor"
            ];
          })
        ];
        nativeBuildInputs = with pkgs; [
          copyDesktopItems
          nodejs_24
          pnpm
          pnpmConfigHook
          pkg-config
          wrapGAppsHook3
        ];
        buildInputs = desktopLibraries;
        RUSTFLAGS = "-Clinker-features=-lld";
        preBuild = ''
          pnpm exec vite build
        '';
        # The development check runs the test suites separately.
        doCheck = false;
        preFixup = ''
          gappsWrapperArgs+=(--suffix PATH : ${
            pkgs.lib.makeBinPath [
              pkgs.git
              pkgs.openssh
            ]
          })
          # WebKitGTK's environment-enabled inspector is independent of Tauri's devtools.
          gappsWrapperArgs+=(--unset WEBKIT_INSPECTOR_SERVER --unset WEBKIT_INSPECTOR_HTTP_SERVER)
        '';
        postInstall = ''
          install -Dm644 -t "$out/share/licenses/tir" src/ui/fonts/OFL-*.txt src/ui/dictionary/README_en_US.txt
          install -Dm644 src-tauri/icons/icon.svg "$out/share/icons/hicolor/scalable/apps/tir.svg"
          install -Dm644 src-tauri/icons/128x128.png "$out/share/icons/hicolor/128x128/apps/tir.png"
        '';
        meta.mainProgram = "tir";
      });
    in
    {
      packages.${system} = {
        inherit tir;
        default = tir;
      };

      devShells.${system}.default = pkgs.mkShell {
        # Following the NixOS wiki's Tauri page and Tauri's Linux prerequisites.
        nativeBuildInputs = with pkgs; [
          pkg-config
          wrapGAppsHook3
        ];
        buildInputs = desktopLibraries ++ [ pkgs.xdotool ];
        shellHook = ''
          # mise's dev and check tasks enter this shell unless they see this.
          export TIR_DEV_SHELL=1
          # GTK needs the schemas to report Wayland's display scale and to
          # open file dialogs; keep the desktop's own data directories too.
          export XDG_DATA_DIRS="$GSETTINGS_SCHEMAS_PATH''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
          # Tauri's prebuilt Node CLI binding needs liblzma, even with Nix Node.
          export LD_LIBRARY_PATH="${
            pkgs.lib.makeLibraryPath [ pkgs.xz ]
          }''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
          export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"
          # Rust links with its bundled LLD by default, which bypasses this
          # shell's linker wrapper, so the binary would not record where GTK
          # and WebKit live (docs/findings.md, "NixOS development shell").
          export RUSTFLAGS="-Clinker-features=-lld''${RUSTFLAGS:+ $RUSTFLAGS}"
        '';
      };
    };
}
