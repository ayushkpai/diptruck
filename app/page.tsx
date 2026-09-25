"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

type GameStatus = "ready" | "playing" | "paused" | "gameover" | "complete";
type VehicleKind = "car" | "van";

type TrafficItem = {
  id: number;
  lane: number;
  progress: number;
  speed: number;
  kind: VehicleKind;
  color: string;
  cycle: number;
};

type ParcelItem = {
  id: number;
  lane: number;
  progress: number;
  speed: number;
  label: string;
  accent: string;
  cycle: number;
};

type GameState = {
  status: GameStatus;
  lane: number;
  timeLeft: number;
  score: number;
  delivered: number;
  missed: number;
  combo: number;
  lives: number;
  traffic: TrafficItem[];
  parcels: ParcelItem[];
  event: string;
  eventAge: number;
};

const LANE_POSITIONS = [18, 50, 82] as const;
const TRAFFIC_COLORS = ["#ff8a65", "#9b9cff", "#ffcc66", "#65d6b0"];
const PARCEL_LABELS = ["NORTH", "RIVER", "MARKET", "HILL"];
const PARCEL_COLORS = ["#ffcd56", "#6ce5c2", "#ff8a65", "#a892ff"];
const TARGET_DELIVERIES = 8;
const START_TIME = 60;
const TICK_MS = 50;
const PARCEL_CATCH_LINE = 0.78;
const COLLISION_LINE = 0.84;

function createTraffic(
  id: number,
  lane: number,
  progress: number,
  speed: number,
  kind: VehicleKind,
): TrafficItem {
  return {
    id,
    lane,
    progress,
    speed,
    kind,
    color: TRAFFIC_COLORS[id % TRAFFIC_COLORS.length],
    cycle: 0,
  };
}

function createParcel(
  id: number,
  lane: number,
  progress: number,
  speed: number,
  label: string,
  accent: string,
): ParcelItem {
  return {
    id,
    lane,
    progress,
    speed,
    label,
    accent,
    cycle: 0,
  };
}

function createGame(status: GameStatus = "ready"): GameState {
  return {
    status,
    lane: 1,
    timeLeft: START_TIME,
    score: 0,
    delivered: 0,
    missed: 0,
    combo: 0,
    lives: 3,
    traffic: [
      createTraffic(1, 0, 0.2, 0.0095, "van"),
      createTraffic(2, 2, 0.46, 0.0075, "car"),
      createTraffic(3, 0, 0.73, 0.008, "car"),
      createTraffic(4, 1, -0.2, 0.006, "van"),
    ],
    parcels: [
      createParcel(11, 1, -0.1, 0.0058, "NORTH", PARCEL_COLORS[0]),
      createParcel(12, 0, 0.31, 0.0052, "RIVER", PARCEL_COLORS[1]),
      createParcel(13, 2, 0.58, 0.0048, "MARKET", PARCEL_COLORS[2]),
      createParcel(14, 1, 0.9, 0.0042, "HILL", PARCEL_COLORS[3]),
    ],
    event: "",
    eventAge: 0,
  };
}

function recycleTraffic(item: TrafficItem): TrafficItem {
  const nextCycle = item.cycle + 1;
  return {
    ...item,
    lane: (item.lane + nextCycle) % 3,
    progress: -0.24,
    speed: 0.006 + ((item.id + nextCycle) % 4) * 0.0012,
    kind: (item.id + nextCycle) % 3 === 0 ? "van" : "car",
    cycle: nextCycle,
  };
}

function recycleParcel(item: ParcelItem): ParcelItem {
  const nextCycle = item.cycle + 1;
  const nextLabelIndex = (item.id + nextCycle) % PARCEL_LABELS.length;
  return {
    ...item,
    lane: (item.lane + nextCycle + 1) % 3,
    progress: -0.26,
    speed: 0.0042 + ((item.id + nextCycle) % 3) * 0.0008,
    label: PARCEL_LABELS[nextLabelIndex],
    accent: PARCEL_COLORS[nextLabelIndex],
    cycle: nextCycle,
  };
}

function formatTime(timeLeft: number) {
  const totalSeconds = Math.max(0, Math.ceil(timeLeft));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGame());

  const startGame = useCallback(() => {
    setGame(createGame("playing"));
  }, []);

  const togglePause = useCallback(() => {
    setGame((current) => {
      if (current.status === "playing") {
        return {
          ...current,
          status: "paused",
          event: "Shift paused",
          eventAge: 0,
        };
      }
      if (current.status === "paused") {
        return {
          ...current,
          status: "playing",
          event: "Back on route",
          eventAge: 0,
        };
      }
      return current;
    });
  }, []);

  const moveLane = useCallback((direction: number) => {
    setGame((current) => {
      if (current.status !== "playing") {
        return current;
      }
      const nextLane = Math.max(0, Math.min(2, current.lane + direction));
      if (nextLane === current.lane) {
        return current;
      }
      return { ...current, lane: nextLane };
    });
  }, []);

  useEffect(() => {
    if (game.status !== "playing") {
      return;
    }

    const interval = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "playing") {
          return current;
        }

        const nextTimeLeft = Math.max(0, current.timeLeft - TICK_MS / 1000);
        if (nextTimeLeft === 0) {
          const finishedStatus =
            current.delivered >= TARGET_DELIVERIES ? "complete" : "gameover";
          return {
            ...current,
            timeLeft: 0,
            status: finishedStatus,
            event:
              finishedStatus === "complete"
                ? "Route complete — great driving"
                : "Shift complete — keep practicing",
            eventAge: 0,
          };
        }

        let nextStatus: GameStatus = "playing";
        let score = current.score;
        let delivered = current.delivered;
        let missed = current.missed;
        let combo = current.combo;
        let lives = current.lives;
        let event = current.eventAge > 18 ? "" : current.event;
        let eventAge = current.eventAge + 1;
        let collisionHandled = false;

        const traffic = current.traffic.map((item) => {
          const nextProgress = item.progress + item.speed;
          const isCollision =
            !collisionHandled &&
            nextProgress >= COLLISION_LINE &&
            item.progress < COLLISION_LINE &&
            item.lane === current.lane;

          if (isCollision) {
            collisionHandled = true;
            lives -= 1;
            combo = 0;
            event = lives > 0 ? "Close call — truck damaged" : "Truck wrecked";
            eventAge = 0;
            if (lives === 0) {
              nextStatus = "gameover";
            }
            return recycleTraffic(item);
          }

          if (nextProgress > 1.12) {
            return recycleTraffic(item);
          }

          return { ...item, progress: nextProgress };
        });

        const parcels = current.parcels.flatMap((item) => {
          const nextProgress = item.progress + item.speed;
          const isCatch =
            nextProgress >= PARCEL_CATCH_LINE && item.progress < PARCEL_CATCH_LINE;

          if (isCatch) {
            if (item.lane === current.lane) {
              delivered += 1;
              score += 100 + combo * 25;
              combo += 1;
              event = `${item.label} parcel delivered`;
              eventAge = 0;
            } else {
              missed += 1;
              combo = 0;
              event = "Wrong lane — parcel missed";
              eventAge = 0;
            }
            return [recycleParcel(item)];
          }

          if (nextProgress > 1.1) {
            return [recycleParcel(item)];
          }

          return [{ ...item, progress: nextProgress }];
        });

        if (delivered >= TARGET_DELIVERIES) {
          nextStatus = "complete";
          score += Math.round(nextTimeLeft * 10);
          event = "Route complete — bonus time claimed";
          eventAge = 0;
        }

        return {
          ...current,
          status: nextStatus,
          timeLeft: nextTimeLeft,
          score,
          delivered,
          missed,
          combo,
          lives,
          traffic,
          parcels,
          event,
          eventAge,
        };
      });
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [game.status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        moveLane(-1);
      }
      if (key === "arrowright" || key === "d") {
        event.preventDefault();
        moveLane(1);
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (game.status === "ready" || game.status === "gameover" || game.status === "complete") {
          startGame();
        } else {
          togglePause();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [game.status, moveLane, startGame, togglePause]);

  const totalSeconds = Math.max(0, Math.ceil(game.timeLeft));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const nextParcel = [...game.parcels].sort((a, b) => b.progress - a.progress)[0];
  const progress = Math.min(100, (game.delivered / TARGET_DELIVERIES) * 100);
  const statusLabel = {
    ready: "READY TO ROLL",
    playing: "LIVE ROUTE",
    paused: "PAUSED",
    gameover: "SHIFT OVER",
    complete: "ROUTE COMPLETE",
  }[game.status];

  const overlayTitle = {
    ready: "Your route is ready",
    playing: "",
    paused: "Taking a breather",
    gameover: "Shift complete",
    complete: "You delivered everything",
  }[game.status];

  const overlayText = {
    ready: "Match each parcel to the lane it is traveling in. Clear traffic, build a streak, and beat the clock.",
    playing: "",
    paused: "Your truck and parcels are frozen until you return to the road.",
    gameover: `${game.delivered} of ${TARGET_DELIVERIES} parcels made it home. The city is ready for another run.`,
    complete: `You cleared every stop with ${formatTime(game.timeLeft)} left and ${game.score.toLocaleString()} points.`,
  }[game.status];

  const overlayAction = {
    ready: "Start shift",
    playing: "",
    paused: "Resume shift",
    gameover: "Try again",
    complete: "Run it back",
  }[game.status];

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>DIPTRUCK</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerRoute}>CITY GRID / 04</span>
          <span className={styles.headerDivider} />
          <span className={styles.bestScore}>SHIFT 01 / 60 SEC</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>NEON FREIGHT / NIGHT SHIFT</p>
          <h1>
            Delivery <span>Rush</span>
          </h1>
          <p className={styles.heroCopy}>
            Thread the traffic. Catch the cargo. Keep the city moving.
          </p>
        </div>
        <div className={styles.heroStamp}>
          <span className={styles.stampDot} />
          <span>ROUTE CONTROL</span>
          <strong>LIVE</strong>
        </div>
      </section>

      <section className={styles.dashboard} aria-label="Delivery Rush game">
        <div className={styles.gameColumn}>
          <div className={styles.gameMeta}>
            <div>
              <span className={styles.metaLabel}>CURRENT SHIFT</span>
              <span className={styles.metaValue}>DOWNTOWN LOOP</span>
            </div>
            <div className={`${styles.statusBadge} ${styles[game.status]}`}>
              <span className={styles.statusPulse} />
              {statusLabel}
            </div>
          </div>

          <div className={styles.playfield}>
            <div className={styles.playfieldHeader}>
              <span>DEPOT DROP</span>
              <span>WIND 12 KM/H</span>
            </div>
            <div className={styles.road} aria-label="Game road">
              <div className={styles.roadGlow} />
              <div className={styles.laneLineOne} />
              <div className={styles.laneLineTwo} />
              <div className={styles.roadEdgeLeft} />
              <div className={styles.roadEdgeRight} />
              <div className={styles.catchLine} />
              <span className={styles.roadLabelTop}>DROP ZONE</span>
              <span className={styles.roadLabelBottom}>PICKUP</span>

              {game.traffic.map((item) => (
                <div
                  className={`${styles.vehicle} ${item.kind === "van" ? styles.van : styles.car}`}
                  key={item.id}
                  style={{
                    backgroundColor: item.color,
                    left: `${LANE_POSITIONS[item.lane]}%`,
                    top: `${item.progress * 100}%`,
                  }}
                  aria-hidden="true"
                >
                  <span className={styles.vehicleWindow} />
                  <span className={styles.vehicleStripe} />
                  <span className={styles.vehicleLight} />
                </div>
              ))}

              {game.parcels.map((item) => (
                <div
                  className={styles.parcel}
                  key={item.id}
                  style={{
                    left: `${LANE_POSITIONS[item.lane]}%`,
                    top: `${item.progress * 100}%`,
                    borderColor: item.accent,
                  }}
                  aria-hidden="true"
                >
                  <span className={styles.parcelLabel}>{item.label.slice(0, 2)}</span>
                  <span className={styles.parcelTape} />
                </div>
              ))}

              <div
                className={styles.truck}
                style={{ left: `${LANE_POSITIONS[game.lane]}%` }}
                aria-label="Your delivery truck"
              >
                <span className={styles.truckLight} />
                <span className={styles.truckCab}>
                  <span className={styles.truckWindow} />
                </span>
                <span className={styles.truckBox}>
                  <span className={styles.truckBoxMark}>DR</span>
                </span>
                <span className={styles.truckWheelOne} />
                <span className={styles.truckWheelTwo} />
              </div>

              {game.event && <div className={styles.eventToast}>{game.event}</div>}
            </div>

            {game.status !== "playing" && (
              <div className={styles.overlay}>
                <div className={styles.overlayCard}>
                  <span className={styles.overlayKicker}>
                    {game.status === "complete" ? "PERFECT ROUTE" : "DISPATCH DESK"}
                  </span>
                  <h2>{overlayTitle}</h2>
                  <p>{overlayText}</p>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={game.status === "paused" ? togglePause : startGame}
                  >
                    {overlayAction}
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.controlsBar}>
            <div className={styles.controlHint}>
              <span className={styles.keyHint}>←</span>
              <span className={styles.keyHint}>→</span>
              <span>steer your truck</span>
            </div>
            <div className={styles.touchControls}>
              <button
                className={styles.steerButton}
                type="button"
                onClick={() => moveLane(-1)}
                aria-label="Move truck left"
              >
                ←
              </button>
              <button
                className={styles.steerButton}
                type="button"
                onClick={() => moveLane(1)}
                aria-label="Move truck right"
              >
                →
              </button>
            </div>
            <span className={styles.pauseHint}>SPACE TO PAUSE</span>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sideHeader}>
            <span>ROUTE CONTROL</span>
            <span className={styles.signalBars} aria-label="Signal strong">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>

          <div className={styles.routeCard}>
            <div className={styles.routeCardTop}>
              <div>
                <span className={styles.cardEyebrow}>DELIVERY PROGRESS</span>
                <strong>
                  {String(game.delivered).padStart(2, "0")} / {String(TARGET_DELIVERIES).padStart(2, "0")}
                </strong>
              </div>
              <span className={styles.routeIcon}>↗</span>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={TARGET_DELIVERIES}
              aria-valuenow={game.delivered}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.routeCardBottom}>
              <span>{game.delivered === TARGET_DELIVERIES ? "All stops cleared" : "Keep the wheels turning"}</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.cardEyebrow}>SCORE</span>
              <strong>{game.score.toLocaleString()}</strong>
              <span className={styles.statAccent}>POINTS</span>
            </div>
            <div className={`${styles.statCard} ${styles.timerCard}`}>
              <span className={styles.cardEyebrow}>SHIFT TIME</span>
              <strong>{`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}</strong>
              <span className={styles.statAccent}>MIN : SEC</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.cardEyebrow}>STREAK</span>
              <strong>x{game.combo}</strong>
              <span className={styles.statAccent}>CLEAN HITS</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.cardEyebrow}>TRUCK</span>
              <div className={styles.lifeRow} aria-label={`${game.lives} lives remaining`}>
                {[0, 1, 2].map((life) => (
                  <span className={life < game.lives ? styles.lifeFull : styles.lifeEmpty} key={life} />
                ))}
              </div>
              <span className={styles.statAccent}>DAMAGE</span>
            </div>
          </div>

          <div className={styles.nextCard}>
            <span className={styles.cardEyebrow}>NEXT DROP</span>
            <div className={styles.nextDropRow}>
              <span className={styles.dropPin} />
              <div>
                <strong>{nextParcel?.label ?? "NORTH"} DISTRICT</strong>
                <span>Parcel {String(Math.min(game.delivered + 1, TARGET_DELIVERIES)).padStart(2, "0")} / {String(TARGET_DELIVERIES).padStart(2, "0")}</span>
              </div>
              <span className={styles.dropArrow}>→</span>
            </div>
          </div>

          <div className={styles.tipCard}>
            <span className={styles.tipIcon}>✦</span>
            <p><strong>Dispatch tip</strong> Match the lane before the parcel reaches the pickup line. Consecutive hits multiply your score.</p>
          </div>
        </aside>
      </section>

      <footer className={styles.footer}>
        <span>DIPTRUCK / DELIVERY RUSH</span>
        <span>ARROW KEYS OR A / D TO STEER</span>
      </footer>
    </main>
  );
}
