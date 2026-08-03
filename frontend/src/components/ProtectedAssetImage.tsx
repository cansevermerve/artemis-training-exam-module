import { useEffect, useMemo } from "react";

import { useProtectedObjectUrl } from "../hooks/useProtectedObjectUrl";
import type { ApiActor } from "../lib/api";

type ProtectedAssetImageProps = {
  endpoint?: string | null;
  file?: File | null;
  actor?: ApiActor;
  alt: string;
  className?: string;
  errorClassName?: string;
};

export function ProtectedAssetImage({
  endpoint,
  file,
  actor = "user",
  alt,
  className,
  errorClassName = "text-xs text-red-600 dark:text-red-400",
}: ProtectedAssetImageProps) {
  const localUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const protectedImage = useProtectedObjectUrl(file ? null : endpoint, actor);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  const source = localUrl ?? protectedImage.url;
  if (source) {
    return <img src={source} alt={alt} className={className} />;
  }

  if (!file && endpoint && protectedImage.error) {
    return <p className={errorClassName}>Görsel yüklenemedi: {protectedImage.error}</p>;
  }

  return null;
}
