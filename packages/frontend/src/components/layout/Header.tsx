import { CircleCheck, CircleOff, ShieldCheck } from "lucide-react";

interface HeaderProps {
  connected: boolean;
  projectRoot: string;
}

export function Header({ connected, projectRoot }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <ShieldCheck size={24} />
        <div>
          <h1>SentinelAI</h1>
          <p>{projectRoot || "Waiting for backend"}</p>
        </div>
      </div>
      <div className={connected ? "connection online" : "connection offline"}>
        {connected ? <CircleCheck size={16} /> : <CircleOff size={16} />}
        <span>{connected ? "live" : "offline"}</span>
      </div>
    </header>
  );
}
