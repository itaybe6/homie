export type NativeAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type NativeAlertPayload = {
  title?: string;
  message?: string;
  buttons?: NativeAlertButton[];
  options?: { cancelable?: boolean };
};

type Listener = (payload: NativeAlertPayload) => void;

const listeners = new Set<Listener>();

export function subscribeAlerts(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitAlert(payload: NativeAlertPayload) {
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // ignore
    }
  });
}


