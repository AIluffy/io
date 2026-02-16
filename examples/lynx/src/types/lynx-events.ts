declare module '@lynx-js/types' {
  interface InputProps {
    value?: string;
  }
}

export type LynxInputEvent = {
  detail: {
    value: string;
  };
};
