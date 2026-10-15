import { Container } from "@cloudflare/containers";

export class ClamScanner extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
}
