"use client";

import { useEffect } from "react";
import { useDashboardStore } from "../store/dashboard.store";
import type { DashboardEvent, DashboardSnapshot } from "../types/dashboard";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:7890";

export function useSSE(): void {
  const applyEvent = useDashboardStore((state) => state.applyEvent);
  const applySnapshot = useDashboardStore((state) => state.applySnapshot);
  const setConnected = useDashboardStore((state) => state.setConnected);

  useEffect(() => {
    let closed = false;

    fetch(`${BACKEND_URL}/snapshot`)
      .then((response) => response.json() as Promise<DashboardSnapshot>)
      .then((snapshot) => {
        if (!closed) applySnapshot(snapshot);
      })
      .catch(() => {
        if (!closed) setConnected(false);
      });

    const events = new EventSource(`${BACKEND_URL}/events`);
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (message) => {
      applyEvent(JSON.parse(message.data) as DashboardEvent);
    };

    return () => {
      closed = true;
      events.close();
      setConnected(false);
    };
  }, [applyEvent, applySnapshot, setConnected]);
}
