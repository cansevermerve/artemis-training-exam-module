import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

const DEFAULT_MESSAGE =
  "Kaydedilmemiş değişiklikleriniz var. Bu sayfadan ayrılırsanız değişiklikler kaybolacak. Devam etmek istiyor musunuz?";

export function useUnsavedChangesWarning(
  isDirty: boolean,
  message = DEFAULT_MESSAGE
): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
