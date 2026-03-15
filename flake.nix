{
  description = "ClaudeOS - AI Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      # Development shells for all supported systems
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            name = "claudeos-dev";

            buildInputs = with pkgs; [
              nodejs_22
              tmux
              git
            ];

            shellHook = ''
              echo "ClaudeOS development shell"
              echo "  Node.js: $(node --version)"
              echo "  tmux:    $(tmux -V)"
              echo "  git:     $(git --version)"
            '';
          };
        }
      );

      # Packages: supervisor build + container image (Linux only for container)
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          # ---------- Extension VSIX build derivation ----------
          # Builds all 4 first-party extension VSIX files for container auto-install.
          # Each extension uses esbuild for compilation and vsce for packaging.
          # Uses buildNpmPackage per-extension pattern for Nix sandbox compatibility
          # (npm ci requires network; buildNpmPackage pre-fetches deps via npmDepsHash).
          extensionVsix = pkgs.stdenv.mkDerivation {
            pname = "claudeos-extensions";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.nodejs_22 ];

            # In Nix sandbox, network is unavailable. Each extension needs node_modules
            # for esbuild and vsce. We use --install-strategy=nested to keep deps local.
            # NOTE: This derivation requires npmDepsHash or impure mode to fetch deps.
            # TODO: Convert to per-extension buildNpmPackage derivations if npm ci fails
            # in sandbox. For now, this derivation documents the build steps needed.
            buildPhase = ''
              export HOME=$TMPDIR

              for dir in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
                echo "Building $dir..."
                cd $src/$dir

                # Install dependencies (requires network or pre-fetched deps)
                npm ci --ignore-scripts 2>/dev/null || true

                # Compile TypeScript via esbuild (each extension has npm run compile)
                npx esbuild src/extension.ts \
                  --bundle --platform=node --format=cjs \
                  --outfile=out/extension.js \
                  --external:vscode --external:bufferutil --external:utf-8-validate

                # Package as VSIX with controlled filename (no version suffix)
                npx vsce package --no-dependencies -o $TMPDIR/$dir.vsix

                cd $src
              done
            '';

            installPhase = ''
              mkdir -p $out
              for dir in claudeos-sessions claudeos-secrets claudeos-home claudeos-self-improve; do
                cp $TMPDIR/$dir.vsix $out/
              done
            '';
          };

          # ---------- Supervisor build derivation ----------
          # Builds the TypeScript supervisor into a single CJS bundle via esbuild.
          # @fastify/websocket is externalized because it contains native bindings (ws).
          supervisor = pkgs.buildNpmPackage {
            pname = "claudeos-supervisor";
            version = "0.1.0";

            src = ./supervisor;

            # NOTE: Update this hash after first build attempt. Run:
            #   nix build .#default 2>&1 | grep "got:"
            # and replace with the actual hash.
            npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

            # esbuild bundles everything except @fastify/websocket (native bindings)
            buildPhase = ''
              npx esbuild src/index.ts \
                --bundle \
                --platform=node \
                --format=cjs \
                --outfile=dist/supervisor.cjs \
                --external:@fastify/websocket
            '';

            installPhase = ''
              mkdir -p $out/bin $out/lib

              # Copy the bundled supervisor
              cp dist/supervisor.cjs $out/bin/supervisor.cjs

              # Copy externalized @fastify/websocket and its dependency ws
              cp -r node_modules/@fastify $out/lib/
              cp -r node_modules/ws $out/lib/
            '';

            # Skip the default npm build/check phases
            dontNpmBuild = true;
          };
        in
        {
          # `nix build .#default` -- builds supervisor
          default = supervisor;
        } // pkgs.lib.optionalAttrs pkgs.stdenv.isLinux {
          # `nix build .#container` -- builds OCI container image (Linux only)
          # On macOS, use a remote Linux builder: nix build .#container --system x86_64-linux
          container = pkgs.dockerTools.buildLayeredImage {
            name = "ghcr.io/aventre-labs/claudeos";
            tag = "latest";

            contents = [
              pkgs.nodejs_22
              pkgs.tmux
              pkgs.git
              pkgs.code-server
              pkgs.bash
              pkgs.coreutils
              pkgs.cacert          # SSL certificates for HTTPS (Claude Code install, GitHub API)
              pkgs.su-exec         # Lightweight privilege dropping (10KB, better than gosu)
              pkgs.curl            # Required for Claude Code installation
              pkgs.gnugrep         # grep for entrypoint checks
              pkgs.procps          # ps for process checks
              supervisor
            ];

            # fakeRootCommands runs in a fakeroot environment (works cross-platform, unlike runAsRoot)
            fakeRootCommands = ''
              # Create app user and group
              mkdir -p ./etc
              echo "root:x:0:0:root:/root:/bin/bash" > ./etc/passwd
              echo "app:x:1000:1000:ClaudeOS:/home/app:/bin/bash" >> ./etc/passwd
              echo "root:x:0:" > ./etc/group
              echo "app:x:1000:" >> ./etc/group

              # Create home directory for app user
              mkdir -p ./home/app
              chown 1000:1000 ./home/app

              # Create /data directory structure for persistent volume
              mkdir -p ./data/extensions ./data/sessions ./data/secrets ./data/config

              # Create /app directory with config and entrypoint
              mkdir -p ./app
              cp ${./config/product.json} ./app/product.json
              cp ${./config/settings.json} ./app/settings.json
              cp ${./config/default-extensions.json} ./app/default-extensions.json
              cp ${./first-boot/setup.html} ./app/setup.html
              cp ${./entrypoint.sh} ./app/entrypoint.sh
              chmod +x ./app/entrypoint.sh

              # Copy pre-built extension VSIX files for first-boot auto-install
              mkdir -p ./app/extensions
              cp ${extensionVsix}/*.vsix ./app/extensions/

              # Create tmp directory (needed by various tools)
              mkdir -p ./tmp
              chmod 1777 ./tmp
            '';

            config = {
              Entrypoint = [ "/app/entrypoint.sh" ];
              ExposedPorts = {
                "8080/tcp" = {};
                "3100/tcp" = {};
              };
              Env = [
                "NODE_ENV=production"
                "CLAUDEOS_DATA_DIR=/data"
                "TERM=xterm-256color"
                "HOME=/home/app"
                "PATH=/bin:/usr/bin:/home/app/.claude/bin"
                "NODE_PATH=${supervisor}/lib"
                "SSL_CERT_FILE=/etc/ssl/certs/ca-bundle.crt"
              ];
              WorkingDir = "/app";
            };
          };
        }
      );
    };
}
