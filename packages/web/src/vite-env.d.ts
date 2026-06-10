declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_KEIGENT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
