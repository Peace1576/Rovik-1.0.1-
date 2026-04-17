# Rovik Home Assistant PRD

## Product

- Product name: Eve
- Company: Rovik
- Category: Home operations assistant
- Positioning: Eve is the operating system for your home. She manages household admin, digital life, and household money operations through voice, chat, and automations.

## Problem

Households do not fail because people lack information. They fail because home admin is fragmented across inboxes, calendars, bills, subscriptions, shopping, tasks, reminders, and smart-home controls. Important work gets dropped because the system of record is spread across apps and people.

Current assistants are weak in this category because they are either:

- generic chatbots with no operational memory
- smart speakers with shallow workflows
- finance tools without household context
- task apps without inbox, billing, and device intelligence

## Product thesis

Users will trust and retain Eve if she becomes dependable at the repeated operational loops that run a household:

- what needs attention today
- what is due soon
- what should be canceled or renewed
- what should be bought, delayed, or compared
- what home tasks should be assigned or automated

## Target user

Primary user:

- busy household operator
- parent or couple managing shared responsibilities
- remote worker managing home and digital life from one device
- user with high admin load and frequent inbox spillover

Early adopter segments:

- dual-income households
- ADHD users who need operational support
- Home Assistant power users
- users already living in Gmail and Google Calendar

## Core jobs to be done

1. Tell me what matters in my home today.
2. Turn household email into tasks, reminders, and decisions.
3. Keep bills, subscriptions, and renewals under control.
4. Help me research and coordinate home purchases.
5. Run or suggest routines for my devices and recurring chores.

## MVP scope

Eve MVP should support six product workflows only.

### 1. Morning Home Brief

Input:

- time of day
- calendar
- weather
- due bills
- deliveries
- open tasks
- notable inbox items

Output:

- today summary
- top three household actions
- warnings and deadlines

### 2. Household Inbox Triage

Input:

- Gmail categories
- receipts
- bills
- shipping updates
- school and vendor emails

Output:

- action list
- follow-up list
- archive safe list
- reminders and draft replies

### 3. Bills and Subscriptions

Input:

- recurring charges
- due dates
- receipts
- renewal notices
- free-trial expiration emails

Output:

- due soon view
- cancel or downgrade opportunities
- unusual increases
- month-to-date summary

### 4. Home Task Operator

Input:

- chores
- errands
- maintenance reminders
- shopping lists
- recurring routines

Output:

- prioritized tasks
- recurring schedules
- reminders
- shared list updates

### 5. Smart Home Control

Input:

- Home Assistant devices and scenes
- named routines

Output:

- device commands
- bedtime, away, and energy-saving routines
- confirmation states

### 6. Purchase and Savings Assistant

Input:

- product need
- price targets
- household context
- existing subscriptions and spending patterns

Output:

- options comparison
- savings recommendations
- buy now vs wait guidance

## Non-goals

These should stay out of scope for the first release:

- investment advice
- lending, underwriting, or tax advice
- broad work assistant positioning
- uncontrolled autonomous execution
- advanced family social features

## Trust model

Eve should operate with a clear permission ladder:

- Read: inspect inbox, bills, calendar, device state
- Suggest: recommend actions
- Draft: write a reply, build a task list, prepare a cancellation
- Confirm: ask for approval before risky action
- Execute: perform an approved action

Always require explicit approval for:

- sending email
- canceling a subscription
- controlling locks or security-sensitive devices
- computer actions
- purchases
- any future money movement

## Household memory model

Eve should remember:

- household members
- vendors and service providers
- recurring bills
- subscriptions
- devices
- routines
- shopping preferences
- budget categories
- active home projects
- service dates and warranties

## Core screens

1. Home Brief
2. Inbox
3. Bills
4. Tasks
5. Devices
6. Savings
7. Settings and integrations
8. Action history

## Integrations priority

Tier 1:

- Gmail
- Google Calendar
- Home Assistant
- notifications
- household memory

Tier 2:

- subscription and billing detection from inbox
- shopping and product search
- shared household tasks

Tier 3:

- bank aggregation for read-only household spending visibility
- merchant normalization
- family mode

## Success metrics

North star:

- weekly active households

MVP product metrics:

- morning brief open rate
- inbox actions completed
- bills caught before due date
- subscriptions flagged or canceled
- recurring task completion rate
- week-4 household retention

## Launch criteria

Eve is ready for alpha when she can reliably do the following:

- generate a useful morning home brief
- convert inbox items into actionable tasks
- identify bills and subscription events
- complete device routines with confirmation
- maintain action history and trust states

## Main risks

- too broad positioning
- weak trust and approval design
- inaccurate bill detection
- poor latency in voice mode
- shallow household memory
- unclear multi-user household model

## Product decision

Rovik should not market Eve as a generic AI assistant. Eve should be marketed as a home operations assistant with digital life and household money support built into the category.
