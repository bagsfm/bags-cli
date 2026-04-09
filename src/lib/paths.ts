import { homedir } from "node:os";
import { join } from "node:path";

export const BAGS_CONFIG_DIR = join(homedir(), ".config", "bags");
export const BAGS_KEYPAIR_PATH = join(BAGS_CONFIG_DIR, "keypair.json");
export const BAGS_CREDENTIALS_PATH = join(BAGS_CONFIG_DIR, "credentials.json");
export const BAGS_SETTINGS_PATH = join(BAGS_CONFIG_DIR, "config.json");
