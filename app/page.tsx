"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";

type GameStatus = "ready" | "playing" | "paused" | "gameover" | "complete";
type RoutePhase = "pickup" | "driving" | "parked";
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

type GameState = {
  status: GameStatus;
  phase: RoutePhase;
  lane: number;
  routeProgress: number;
  timeLeft: number;
  score: number;
  delivered: number;
  combo: number;
  lives: number;
  traffic: TrafficItem[];
  event: string;
  eventAge: number;
};

const LANE_POSITIONS = [32, 50, 68] as const;
const TRAFFIC_COLORS = ["#ff8a65", "#9b9cff", "#ffcc66", "#65d6b0"];
const START_TIME = 45;
const ROUTE_SPEED = 0.0055;
const TICK_MS = 50;
const DROP_TRIGGER = 0.9;
const DROP_LANE = 1;

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

function createGame(status: GameStatus = "ready"): GameState {
  return {
    status,
    phase: "pickup",
    lane: 1,
    routeProgress: 0,
    timeLeft: START_TIME,
    score: 0,
    delivered: 0,
    combo: 0,
    lives: 3,
    traffic: [
      createTraffic(1, 0, 0.57, 0.0032, "car"),
      createTraffic(2, 2, 0.84, 0.0027, "van"),
      createTraffic(3, 1, 0.38, 0.003, "car"),
    ],
    event: "",
    eventAge: 0,
  };
}

function recycleTraffic(item: TrafficItem): TrafficItem {
  const nextCycle = item.cycle + 1;
  return {
    ...item,
    lane: (item.lane + nextCycle + 1) % 3,
    progress: 1.1,
    speed: 0.0025 + ((item.id + nextCycle) % 4) * 0.00035,
    kind: (item.id + nextCycle) % 3 === 0 ? "van" : "car",
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

  const loadParcel = useCallback(() => {
    setGame((current) => {
      if (current.status !== "playing" || current.phase !== "pickup") {
        return current;
      }
      return {
        ...current,
        phase: "driving",
        event: "Parcel loaded — follow the route",
        eventAge: 0,
      };
    });
  }, []);

  const parkTruck = useCallback(() => {
    setGame((current) => {
      if (current.status !== "playing" || current.phase !== "parked") {
        return current;
      }
      if (current.lane !== DROP_LANE) {
        return {
          ...current,
          event: "Pull into the center bay to park",
          eventAge: 0,
        };
      }
      return {
        ...current,
        status: "complete",
        phase: "parked",
        routeProgress: 1,
        delivered: 1,
        score: current.score + 500 + Math.round(current.timeLeft * 5),
        event: "Delivery complete — parcel dropped",
        eventAge: 0,
      };
    });
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
      if (current.status !== "playing" || current.phase === "pickup") {
        return current;
      }
      const nextLane = Math.max(0, Math.min(2, current.lane + direction));
      if (nextLane === current.lane) {
        return current;
      }
      return {
        ...current,
        lane: nextLane,
        event:
          current.phase === "parked" && nextLane === DROP_LANE
            ? "Center bay aligned — park when ready"
            : current.event,
        eventAge: nextLane === DROP_LANE ? 0 : current.eventAge,
      };
    });
  }, []);

  useEffect(() => {
    if (
      game.status !== "playing" ||
      game.phase === "pickup" ||
      game.phase === "parked"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "playing" || current.phase !== "driving") {
          return current;
        }

        const nextTimeLeft = Math.max(0, current.timeLeft - TICK_MS / 1000);
        if (nextTimeLeft === 0) {
          return {
            ...current,
            timeLeft: 0,
            status: "gameover",
            event: "Shift complete — the drop-off is still waiting",
            eventAge: 0,
          };
        }

        let event = current.eventAge > 18 ? "" : current.event;
        let eventAge = current.eventAge + 1;
        let lives = current.lives;
        let score = current.score;
        let combo = current.combo;
        let collisionHandled = false;

        const traffic = current.traffic.map((item) => {
          const nextProgress = item.progress - item.speed;
          const isCollision =
            !collisionHandled &&
            item.lane === current.lane &&
            item.progress >= current.routeProgress &&
            nextProgress <= current.routeProgress + ROUTE_SPEED;

          if (isCollision) {
            collisionHandled = true;
            lives -= 1;
            combo = 0;
            score = Math.max(0, score - 25);
            event = lives > 0 ? "Traffic ahead — change lanes" : "Truck wrecked";
            eventAge = 0;
            return recycleTraffic(item);
          }

          if (nextProgress < -0.12) {
            return recycleTraffic(item);
          }

          return { ...item, progress: nextProgress };
        });

        if (lives === 0) {
          return {
            ...current,
            timeLeft: nextTimeLeft,
            status: "gameover",
            score,
            combo,
            lives,
            traffic,
            event,
            eventAge,
          };
        }

        const nextRouteProgress = Math.min(
          DROP_TRIGGER,
          current.routeProgress + ROUTE_SPEED,
        );
        const reachedDrop = nextRouteProgress >= DROP_TRIGGER;

        if (reachedDrop) {
          event =
            current.lane === DROP_LANE
              ? "Drop-off ahead — park in the center bay"
              : "Drop-off ahead — line up in the center bay";
          eventAge = 0;
        }

        return {
          ...current,
          phase: reachedDrop ? "parked" : "driving",
          routeProgress: nextRouteProgress,
          timeLeft: nextTimeLeft,
          score,
          combo,
          lives,
          traffic,
          event,
          eventAge,
        };
      });
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, [game.phase, game.status]);

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
      if (event.code === "Space" || key === "enter") {
        event.preventDefault();
        if (game.status === "ready" || game.status === "gameover" || game.status === "complete") {
          startGame();
        } else if (game.phase === "pickup") {
          loadParcel();
        } else if (game.phase === "parked") {
          parkTruck();
        } else {
          togglePause();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [game.phase, game.status, loadParcel, moveLane, parkTruck, startGame, togglePause]);

  const totalSeconds = Math.max(0, Math.ceil(game.timeLeft));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const routePercent = Math.round(game.routeProgress * 100);
  const isComplete = game.status === "complete";
  const statusLabel = isComplete
    ? "ROUTE COMPLETE"
    : game.status === "ready"
      ? "ROUTE BRIEF"
      : game.status === "paused"
        ? "PAUSED"
        : game.status === "gameover"
          ? "SHIFT OVER"
          : game.phase === "pickup"
            ? "PICKUP READY"
            : game.phase === "parked"
              ? "PARK NOW"
              : "ON ROUTE";

  const overlayTitle = {
    ready: "Your route is ready",
    playing: "",
    paused: "Taking a breather",
    gameover: "Shift complete",
    complete: "You made the drop",
  }[game.status];

  const overlayText = {
    ready: "Park at Pickup A, load the parcel, follow the highlighted map, and park in the center bay at Drop-off B.",
    playing: "",
    paused: "Your route is frozen until you return to the road.",
    gameover: "The route is still open. Try again and keep the truck in the clear lane.",
    complete: `Parcel delivered in ${formatTime(game.timeLeft)} with ${game.score.toLocaleString()} points.`,
  }[game.status];

  const overlayAction = {
    ready: "Start route",
    playing: "",
    paused: "Resume route",
    gameover: "Try again",
    complete: "Run another route",
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
          <span className={styles.bestScore}>SHIFT 01 / 45 SEC</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>NEON FREIGHT / ROUTE RUNNER</p>
          <h1>
            Delivery <span>Rush</span>
          </h1>
          <p className={styles.heroCopy}>
            Park at pickup. Follow the map. Make the drop.
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
              <span className={styles.metaLabel}>CURRENT ROUTE</span>
              <span className={styles.metaValue}>PICKUP A → DROP B</span>
            </div>
            <div className={`${styles.statusBadge} ${styles[game.status]}`}>
              <span className={styles.statusPulse} />
              {statusLabel}
            </div>
          </div>

          <div className={styles.playfield}>
            <div className={styles.playfieldHeader}>
              <span>CITY MAP / ROUTE 04</span>
              <span>2 STOPS</span>
            </div>
            <div className={styles.mapCanvas} aria-label="City route map">
              <div className={styles.mapGrid} />
              <div className={styles.mapBlocks} aria-hidden="true">
                <span className={styles.mapBlockOne} />
                <span className={styles.mapBlockTwo} />
                <span className={styles.mapBlockThree} />
                <span className={styles.mapBlockFour} />
                <span className={styles.mapBlockFive} />
                <span className={styles.mapBlockSix} />
              </div>
              <div className={styles.mapRoad}>
                <div className={styles.mapLaneLineOne} />
                <div className={styles.mapLaneLineTwo} />
                <div className={styles.routeGuide} />
                <div
                  className={styles.routeProgressLine}
                  style={{ width: `${game.routeProgress * 100}%` }}
                />
              </div>
              <svg
                className={styles.mapRouteSvg}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M 9 50 C 27 50, 30 50, 48 50 S 73 50, 91 50" />
                <circle cx="9" cy="50" r="2.2" />
                <circle cx="91" cy="50" r="2.2" />
              </svg>

              <div className={`${styles.pickupMarker} ${game.phase !== "pickup" ? styles.markerComplete : ""}`}>
                <span>A</span>
                <small>PICKUP</small>
              </div>
              <div className={`${styles.dropMarker} ${game.phase === "parked" || isComplete ? styles.dropReady : ""}`}>
                <span>B</span>
                <small>DROP-OFF</small>
              </div>

              {game.traffic.map((item) => (
                <div
                  className={`${styles.trafficVehicle} ${item.kind === "van" ? styles.trafficVan : styles.trafficCar}`}
                  key={item.id}
                  style={{
                    backgroundColor: item.color,
                    left: `${item.progress * 100}%`,
                    top: `${LANE_POSITIONS[item.lane]}%`,
                  }}
                  aria-hidden="true"
                >
                  <span className={styles.trafficWindow} />
                  <span className={styles.trafficStripe} />
                </div>
              ))}

              <div
                className={`${styles.routeTruck} ${game.phase === "parked" ? styles.truckAtDrop : ""}`}
                style={{
                  left: `${10 + game.routeProgress * 80}%`,
                  top: `${LANE_POSITIONS[game.lane]}%`,
                }}
                aria-label="Your delivery truck"
              >
                <span className={styles.routeTruckBox}>
                  <span>DR</span>
                </span>
                <span className={styles.routeTruckCab}>
                  <span className={styles.routeTruckWindow} />
                </span>
                <span className={styles.routeWheelOne} />
                <span className={styles.routeWheelTwo} />
              </div>

              {game.phase === "pickup" && (
                <div className={styles.routePrompt}>
                  <span className={styles.promptKicker}>STOP A / PICKUP</span>
                  <strong>Park here and load the parcel</strong>
                  <button type="button" onClick={loadParcel}>
                    Load parcel &amp; drive <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}

              {game.phase === "parked" && !isComplete && (
                <div className={styles.routePrompt}>
                  <span className={styles.promptKicker}>STOP B / DROP-OFF</span>
                  <strong>Use the center bay, then park</strong>
                  <button type="button" onClick={parkTruck}>
                    Park truck <span aria-hidden="true">↓</span>
                  </button>
                </div>
              )}

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
              <span>steer around traffic</span>
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
            <span className={styles.pauseHint}>SPACE TO LOAD / PARK</span>
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
                <span className={styles.cardEyebrow}>ROUTE PROGRESS</span>
                <strong>{routePercent}%</strong>
              </div>
              <span className={styles.routeIcon}>↗</span>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={routePercent}
            >
              <span style={{ width: `${routePercent}%` }} />
            </div>
            <div className={styles.routeCardBottom}>
              <span>
                {game.phase === "pickup"
                  ? "Load at Pickup A"
                  : game.phase === "parked"
                    ? "Park at Drop-off B"
                    : "Follow the map"}
              </span>
              <span>{game.delivered ? "Delivered" : "1 parcel"}</span>
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
              <span className={styles.cardEyebrow}>CLEAN ROUTE</span>
              <strong>{game.combo}</strong>
              <span className={styles.statAccent}>AVOIDED HITS</span>
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
            <span className={styles.cardEyebrow}>NEXT STOP</span>
            <div className={styles.nextDropRow}>
              <span className={styles.dropPin} />
              <div>
                <strong>
                  {game.phase === "pickup" ? "PICKUP DEPOT" : "NORTHSIDE MARKET"}
                </strong>
                <span>
                  {game.phase === "pickup"
                    ? "Park in bay A to load"
                    : game.phase === "parked"
                      ? "Center bay B is ready"
                      : "Follow the highlighted route"}
                </span>
              </div>
              <span className={styles.dropArrow}>→</span>
            </div>
          </div>

          <div className={styles.tipCard}>
            <span className={styles.tipIcon}>✦</span>
            <p><strong>Dispatch tip</strong> The truck drives itself along the route. Steer around traffic, then park neatly in the center bay.</p>
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
