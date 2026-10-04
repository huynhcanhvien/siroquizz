import type messages from "../messages/vi.json";
import type { Locale } from "./i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
