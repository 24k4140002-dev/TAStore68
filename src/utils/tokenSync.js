export function shouldApplySyncToken(storedToken, incomingToken) {
  return Boolean(incomingToken && incomingToken !== storedToken);
}

export function isStandaloneApp(windowRef) {
  return Boolean(
    windowRef?.matchMedia?.('(display-mode: standalone)').matches
    || windowRef?.navigator?.standalone === true
  );
}
