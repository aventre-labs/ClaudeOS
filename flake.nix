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
    };
}
