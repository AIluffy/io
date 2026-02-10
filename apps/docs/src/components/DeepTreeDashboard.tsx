import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'io-store';
import { useIO } from 'io-react';

type TreeState = {
  app: {
    config: { theme: string; density: string };
    runtime: { fps: number; mem: number };
  };
  project: {
    meta: { name: string; version: string };
    stats: { issues: number; velocity: number };
  };
  user: {
    profile: { name: string; role: string };
    activity: { score: number; streak: number };
  };
};

function createTreeState(): TreeState {
  return {
    app: {
      config: { theme: 'Aurora', density: 'Comfort' },
      runtime: { fps: 60, mem: 512 },
    },
    project: {
      meta: { name: 'Deep Tree', version: '1.3.2' },
      stats: { issues: 7, velocity: 42 },
    },
    user: {
      profile: { name: 'Ada', role: 'Maintainer' },
      activity: { score: 86, streak: 4 },
    },
  };
}

type Store = ReturnType<typeof io<TreeState>>;

type LeafButton = {
  label: string;
  onClick: (store: Store) => void;
  flash: () => void;
};

function useFlash(duration = 280): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const trigger = () => {
    setActive(true);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setActive(false);
    }, duration);
  };

  return [active, trigger];
}

function TreeLeaf({
  label,
  value,
  flashing,
}: {
  label: string;
  value: string | number;
  flashing: boolean;
}): JSX.Element {
  return (
    <div className={`deep-tree-leaf${flashing ? ' is-flashing' : ''}`}>
      <span className="deep-tree-leaf__label">{label}</span>
      <span className="deep-tree-leaf__value">{value}</span>
    </div>
  );
}

function TreeBranch({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="deep-tree-branch">
      <div className="deep-tree-branch__title">{title}</div>
      <div className="deep-tree-branch__body">{children}</div>
    </section>
  );
}

export function DeepTreeDashboard(): JSX.Element {
  const store = useMemo(() => io<TreeState>(createTreeState()), []);

  const [flashTheme, triggerTheme] = useFlash();
  const [flashDensity, triggerDensity] = useFlash();
  const [flashFps, triggerFps] = useFlash();
  const [flashMem, triggerMem] = useFlash();
  const [flashName, triggerName] = useFlash();
  const [flashVersion, triggerVersion] = useFlash();
  const [flashIssues, triggerIssues] = useFlash();
  const [flashVelocity, triggerVelocity] = useFlash();
  const [flashUserName, triggerUserName] = useFlash();
  const [flashRole, triggerRole] = useFlash();
  const [flashScore, triggerScore] = useFlash();
  const [flashStreak, triggerStreak] = useFlash();

  const buttons: Array<LeafButton> = [
    {
      label: '切换主题',
      onClick: (s) =>
        s.app.config.theme.update((v) => (v === 'Aurora' ? 'Nimbus' : 'Aurora')),
      flash: triggerTheme,
    },
    {
      label: '切换密度',
      onClick: (s) =>
        s.app.config.density.update((v) =>
          v === 'Comfort' ? 'Compact' : 'Comfort',
        ),
      flash: triggerDensity,
    },
    {
      label: '提升 FPS',
      onClick: (s) => s.app.runtime.fps.update((v) => v + 5),
      flash: triggerFps,
    },
    {
      label: '内存 +64',
      onClick: (s) => s.app.runtime.mem.update((v) => v + 64),
      flash: triggerMem,
    },
    {
      label: '切换项目名',
      onClick: (s) =>
        s.project.meta.name.update((v) =>
          v === 'Deep Tree' ? 'Atlas Tree' : 'Deep Tree',
        ),
      flash: triggerName,
    },
    {
      label: '版本 +1',
      onClick: (s) =>
        s.project.meta.version.update((v) => {
          const [a, b, c] = v.split('.').map(Number);
          return [a, b, (c ?? 0) + 1].join('.');
        }),
      flash: triggerVersion,
    },
    {
      label: '问题 -1',
      onClick: (s) => s.project.stats.issues.update((v) => Math.max(0, v - 1)),
      flash: triggerIssues,
    },
    {
      label: '速度 +3',
      onClick: (s) => s.project.stats.velocity.update((v) => v + 3),
      flash: triggerVelocity,
    },
    {
      label: '切换用户',
      onClick: (s) =>
        s.user.profile.name.update((v) => (v === 'Ada' ? 'Grace' : 'Ada')),
      flash: triggerUserName,
    },
    {
      label: '切换角色',
      onClick: (s) =>
        s.user.profile.role.update((v) =>
          v === 'Maintainer' ? 'Reviewer' : 'Maintainer',
        ),
      flash: triggerRole,
    },
    {
      label: '得分 +5',
      onClick: (s) => s.user.activity.score.update((v) => v + 5),
      flash: triggerScore,
    },
    {
      label: '连胜 +1',
      onClick: (s) => s.user.activity.streak.update((v) => v + 1),
      flash: triggerStreak,
    },
  ];

  const theme = useIO(store.app.config.theme);
  const density = useIO(store.app.config.density);
  const fps = useIO(store.app.runtime.fps);
  const mem = useIO(store.app.runtime.mem);
  const name = useIO(store.project.meta.name);
  const version = useIO(store.project.meta.version);
  const issues = useIO(store.project.stats.issues);
  const velocity = useIO(store.project.stats.velocity);
  const username = useIO(store.user.profile.name);
  const role = useIO(store.user.profile.role);
  const score = useIO(store.user.activity.score);
  const streak = useIO(store.user.activity.streak);

  return (
    <div className="deep-tree">
      <div className="deep-tree__controls">
        {buttons.map((button) => (
          <button
            className="deep-tree__button"
            key={button.label}
            onClick={() => {
              button.onClick(store);
              button.flash();
            }}
          >
            {button.label}
          </button>
        ))}
      </div>

      <div className="deep-tree__canvas">
        <TreeBranch title="app">
          <TreeBranch title="config">
            <TreeLeaf label="theme" value={theme} flashing={flashTheme} />
            <TreeLeaf label="density" value={density} flashing={flashDensity} />
          </TreeBranch>
          <TreeBranch title="runtime">
            <TreeLeaf label="fps" value={fps} flashing={flashFps} />
            <TreeLeaf label="mem" value={mem} flashing={flashMem} />
          </TreeBranch>
        </TreeBranch>

        <TreeBranch title="project">
          <TreeBranch title="meta">
            <TreeLeaf label="name" value={name} flashing={flashName} />
            <TreeLeaf label="version" value={version} flashing={flashVersion} />
          </TreeBranch>
          <TreeBranch title="stats">
            <TreeLeaf label="issues" value={issues} flashing={flashIssues} />
            <TreeLeaf
              label="velocity"
              value={velocity}
              flashing={flashVelocity}
            />
          </TreeBranch>
        </TreeBranch>

        <TreeBranch title="user">
          <TreeBranch title="profile">
            <TreeLeaf label="name" value={username} flashing={flashUserName} />
            <TreeLeaf label="role" value={role} flashing={flashRole} />
          </TreeBranch>
          <TreeBranch title="activity">
            <TreeLeaf label="score" value={score} flashing={flashScore} />
            <TreeLeaf label="streak" value={streak} flashing={flashStreak} />
          </TreeBranch>
        </TreeBranch>
      </div>
    </div>
  );
}
