# College Exam Time Planner

Small web app for planning long exams across the college day and printing a simple timetable.

## What it does

- Splits two exams across the fixed day structure of `09:00` to `16:30`
- Automatically removes the built-in breaks:
  - `11:10` to `11:25`
  - `13:35` to `14:20`
  - `15:20` to `15:25`
- Applies extra time as a percentage
- Builds a printable day-by-day list
- Warns when the selected date range is too short

## Default use case

The planner starts with:

- Exam 1: `25` hours
- Exam 2: `32` hours
- A 4-week planning window

You can change the names, durations, extra time, available weekdays, and dates.

## Run locally

```sh
cd /Users/tomlandy/Documents/Playground
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Deploy on Render

1. Push the project to a GitHub repository.
2. In Render, create a new `Web Service`.
3. Connect the repository.
4. Confirm these settings:

```text
Environment: Node
Build Command: npm install
Start Command: npm start
```

You can also use the included [render.yaml](/Users/tomlandy/Documents/Playground/render.yaml).

## Main files

- [index.html](/Users/tomlandy/Documents/Playground/index.html): planner layout and printable output area
- [app.js](/Users/tomlandy/Documents/Playground/app.js): scheduling logic and rendering
- [styles.css](/Users/tomlandy/Documents/Playground/styles.css): screen and print styling
- [server.js](/Users/tomlandy/Documents/Playground/server.js): lightweight Node static server
- [render.yaml](/Users/tomlandy/Documents/Playground/render.yaml): Render blueprint
