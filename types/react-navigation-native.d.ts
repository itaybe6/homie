declare module '@react-navigation/native' {
  // Minimal shim to satisfy TS in this project setup.
  // expo-router provides navigation at runtime; types may not be present in this workspace.
  export function useNavigation<T = any>(): T;
}

