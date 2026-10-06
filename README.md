# ParkFlow

ParkFlow is a GitHub Spark web application for exploring theme parks, comparing seeded wait-time and crowd information, submitting community wait-time reports, and keeping a personal trip and ride history.

The current catalog covers 10 destination groups and 24 theme and water parks, including Walt Disney World, Disneyland, Universal, Six Flags, Cedar Point, Knott's Berry Farm, Worlds of Fun, and Silverwood.

> **Data note:** ParkFlow is currently a demo/prototype. Its attraction catalog and starting wait times are checked-in sample data. Crowd levels, historical wait-time charts, and weather are generated locally rather than fetched from authoritative live services. User reports update the app's Spark KV-backed data, but the app should not be treated as an official source for park operations.

## What the app can do

- **Browse parks and attractions:** filter destination groups, switch between parks, inspect attraction status, and sort waits by time or name.
- **Review park details:** see operating-attraction counts, minimum/maximum/average waits, and attraction-level trend charts.
- **Compare crowd calendars:** select a resort group and one or more parks, move between months, and compare deterministic daily crowd estimates.
- **Report wait times:** signed-in users can enter a wait, mark an attraction closed, or run a persistent queue timer before submitting.
- **Track trips:** create single-day or multi-day trips, select multiple parks, record ride counts and variants, and add ride or trip notes.
- **Manage ride history:** resume/edit or delete saved trips, search logs, filter by park or attraction type, and view aggregate trip/ride counts.
- **Use a responsive interface:** desktop navigation and mobile bottom navigation expose the same core workflows.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Destination overview and primary actions |
| `/parks` | Park selection |
| `/park/:parkId` | Park overview, waits, and crowd calendar |
| `/park/:parkId/attraction/:attractionId` | Attraction status and generated wait trends |
| `/calendar` | Multi-park crowd comparison |
| `/log` and `/log/:parkId` | Trip setup and ride logging |
| `/my-logs` | Saved trips and ride history |
| `/about` | In-app product overview |

Unknown routes redirect to `/`.

## Architecture

- **UI:** React 19, TypeScript, React Router, Tailwind CSS 4, Radix UI primitives, Phosphor/Lucide icons, Sonner notifications, and Recharts.
- **Build tooling:** Vite 6 with the React SWC and GitHub Spark plugins.
- **State and persistence:** React state for transient UI and GitHub Spark KV (`useKV` and `window.spark.kv`) for accounts, the active user, attraction data, reports, timers, and trips.
- **Data model:** checked-in park and attraction records in `src/data/sampleData.ts`, normalized into Spark KV at startup.
- **Authentication:** client-side account creation and sign-in backed by Spark KV. Passwords are SHA-256 hashed in the browser and login attempts are rate-limited, but there is no server-side identity service.
- **Weather:** deterministic mock weather is enabled in `src/services/weatherService.ts`; no weather API key is currently used.

Key source areas:

```text
src/
  components/   Reusable product and UI components
  data/         Seeded park and attraction catalog
  hooks/        Reporting and persistent timer state
  pages/        Route-level screens
  services/     Authentication, KV, park data, trips, and weather
  types/        Shared application models
```

## Local development

### Prerequisites

- Node.js and npm
- A modern browser with Web Crypto support

### Install and run

```bash
npm install
npm run dev
```

Vite prints the local URL when the development server starts. The GitHub Spark Vite plugin supplies the Spark runtime used by the app.

No `.env` file or application secret is required by the current implementation. `vite.config.ts` accepts an optional `PROJECT_ROOT` environment variable to override the source root used for the `@` alias; normal development does not need it.

The checked-in lockfile is not currently synchronized with `package.json`, so `npm ci` fails. Use `npm install` until the lockfile is repaired in a separate dependency-maintenance change.

Spark KV availability is required for account, reporting, timer, and trip persistence. The app can render if KV initialization times out, but persistence-dependent actions will be unavailable or fail with an explanatory message.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run the TypeScript project build without type checking, then create a production Vite bundle |
| `npm run lint` | Run ESLint across the repository |
| `npm run optimize` | Pre-bundle Vite dependencies |
| `npm run preview` | Serve the production bundle locally |
| `npm run kill` | Stop a process listening on port 5000 using `fuser` (Unix-like environments only) |

The repository does not currently include an automated test suite or a `test` package script. `npm run build` is the working checked-in validation path, and `npm run optimize` can verify dependency pre-bundling (although Vite reports that manual optimization is deprecated). The lint script is present but currently exits before checking files because the repository does not contain the `eslint.config.*` file required by ESLint 9. Manually exercise any changed user workflow.

## Production build and deployment

Create the production bundle with:

```bash
npm run build
npm run preview
```

Vite writes the static bundle to `dist/`. The repository is configured as a GitHub Spark application through `spark.meta.json`, `runtime.config.json`, and the Spark Vite plugin. Publish/deploy it through the associated GitHub Spark project.

There is no repository-defined deployment script or CI/CD workflow. A generic static host can serve the generated assets, but the product's persisted workflows depend on the GitHub Spark runtime and KV APIs; verify those capabilities before using another host.

## Current limitations

- Wait-time seed values are not synchronized with official park feeds.
- Crowd calendars and attraction history charts are generated estimates, not measured forecasts or historical observations.
- Weather is simulated while `USE_MOCK_DATA` remains enabled.
- Authentication and authorization are implemented entirely in the browser and Spark KV; this is not a production-grade identity boundary.
- Stored user and trip data is tied to the Spark KV environment in which the app runs.

## License

See [LICENSE](LICENSE).
