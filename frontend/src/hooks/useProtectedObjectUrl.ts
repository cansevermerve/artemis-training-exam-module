import { useEffect, useState } from "react";
import { apiBlobRequest, type ApiActor } from "../lib/api";

type ObjectUrlState = {
  endpoint: string;
  url: string | null;
  error: string | null;
};

export function useProtectedObjectUrl(endpoint: string | null | undefined, actor: ApiActor = "user") {
  const [state, setState] = useState<ObjectUrlState>({ endpoint: "", url: null, error: null });

  useEffect(() => {
    if (!endpoint) return undefined;

    let active = true;
    let objectUrl: string | null = null;

    void apiBlobRequest(endpoint, {}, actor)
      .then(({ blob }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ endpoint, url: objectUrl, error: null });
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setState({
          endpoint,
          url: null,
          error: requestError instanceof Error ? requestError.message : "Dosya yüklenemedi.",
        });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [actor, endpoint]);

  if (!endpoint || state.endpoint !== endpoint) return { url: null, error: null };
  return { url: state.url, error: state.error };
}
