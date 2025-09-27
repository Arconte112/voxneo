declare module '@nut-tree/nut-js' {
  export const keyboard: {
    pressKey: (...keys: Key[]) => Promise<void>;
    releaseKey: (...keys: Key[]) => Promise<void>;
  };

  export const Key: {
    LeftControl: unknown;
    V: unknown;
  };
}
