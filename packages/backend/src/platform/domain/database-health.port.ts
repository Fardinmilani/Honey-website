export interface DatabaseHealthPort {
  check(): Promise<void>;
}
