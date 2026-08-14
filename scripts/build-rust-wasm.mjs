import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = resolve(root, "rust/optothermal-core/Cargo.toml");
const candidates = [
  process.env.CARGO,
  resolve(root, ".rustup-local/toolchains/1.97.1-x86_64-pc-windows-gnu/bin/cargo.exe"),
  resolve(root, "../waveguide-mode-solver/.rustup-local/toolchains/1.97.1-x86_64-pc-windows-gnu/bin/cargo.exe"),
  "cargo",
].filter(Boolean);
const cargo = candidates.find((candidate) => candidate === "cargo" || existsSync(candidate));

if (!cargo) {
  console.error("Rust Cargo was not found. Install Rust and the wasm32-unknown-unknown target.");
  process.exit(1);
}

const cargoDirectory = cargo === "cargo" ? undefined : dirname(cargo);
const build = spawnSync(cargo, ["build", "--manifest-path", manifest, "--target", "wasm32-unknown-unknown", "--release"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PATH: cargoDirectory ? `${cargoDirectory};${process.env.PATH}` : process.env.PATH },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const source = resolve(root, "rust/optothermal-core/target/wasm32-unknown-unknown/release/optothermal_core.wasm");
const destination = resolve(root, "src/wasm/optothermal_core.wasm");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
