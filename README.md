# PayNudge (Freelancer Invoice Chaser)

PayNudge is a modern, AI-powered SaaS platform designed to help freelancers automatically track and chase unpaid invoices. It leverages smart parsing, multi-channel automated follow-ups (Email & SMS), and predictive risk scoring to ensure you get paid on time without the awkward conversations.

## 🚀 Features

- **Automated Multi-Channel Chasing**: Configurable smart follow-ups via Email and SMS based on customizable schedules and invoice stages.
- **AI-Powered Invoice Parsing**: Automatically extracts details from uploaded invoice files using Google Generative AI (Gemini).
- **Predictive Risk Scoring**: AI-driven analysis to identify high-risk clients based on behavioral tracking and payment history.
- **Smart Tones**: Dynamically adjust the tone of the reminder (Friendly, Professional, Firm) based on user preference or AI suggestions.
- **Event Tracking**: Real-time visibility into email opens, link clicks, and invoice lifecycle events right from the dashboard.
- **One-Click Payment Links**: Seamless checkout experience for clients to settle invoices.
- **Multi-Tenant Architecture**: Strict data isolation per user, powered by Supabase Authentication and row-level security concepts.
- **Background Processing**: Highly reliable event-driven worker infrastructure using BullMQ and Redis for scheduling reminders asynchronously.

## 🛠️ Tech Stack

**Frontend**
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS 4
- **Authentication**: Supabase Auth (Client-side)
- **Icons**: Lucide React

**Backend**
- **Server**: Express.js (Standalone API)
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma
- **Message Broker/Workers**: BullMQ & Redis (ioredis)
- **Validation**: Zod
- **External Integrations**: 
  - SendGrid/Nodemailer (Emails)
  - Twilio (SMS)
  - LemonSqueezy (Billing & Subscriptions)
  - Google Gemini AI (Invoice Parsing & Risk Analysis)

## 📁 Project Structure

This project is structured as a monorepo containing both the frontend and backend applications in separate directories.

```text
paynudge/
├── frontend/               # Next.js web application
│   ├── src/
│   │   ├── app/            # App Router pages and layouts
│   │   ├── components/     # Reusable React components
│   │   └── lib/            # Frontend utilities and API clients
│   └── package.json
│
├── backend/                # Express API and BullMQ Workers
│   ├── src/
│   │   ├── server/         # Express API controllers, routes, and middleware
│   │   ├── workers/        # BullMQ background job processors
│   │   ├── modules/        # Domain-specific logic (events, AI, billing)
│   │   └── lib/            # Shared utilities (prisma, logger, etc.)
│   ├── prisma/             # Database schema and seed scripts
│   └── package.json
│
└── .env.example            # Root example environment variables template
```

## 🚦 Getting Started

### Prerequisites

- Node.js (v20+)
- PostgreSQL database (e.g., Supabase)
- Redis instance (e.g., Upstash or local)
- Supabase project for Authentication

### Environment Variables

Both the frontend and backend require environment variables to connect to services. A root `.env.example` file is provided. You should create `.env` files in both the `frontend` and `backend` directories as needed based on the example.

Key variables include:
- `DATABASE_URL` & `DIRECT_URL`: PostgreSQL connection strings.
- `REDIS_URL`: Redis connection string for BullMQ.
- `SUPABASE_URL` & `SUPABASE_ANON_KEY`: Supabase credentials for Auth.
- `GEMINI_API_KEY`: Google Generative AI key for invoice parsing.
- `LEMON_SQUEEZY_*`: Lemon Squeezy integration keys for billing.
- `TWILIO_*` & `SMTP_*`: SMS and Email configurations.

### Installation & Setup

1. **Install dependencies**
   You'll need to install dependencies for both the backend and frontend separately. Open two terminal windows/tabs.
   
   **Terminal 1 (Backend):**
   ```bash
   cd backend
   npm install
   ```

   **Terminal 2 (Frontend):**
   ```bash
   cd frontend
   npm install
   ```

2. **Database Setup (Backend)**
   Ensure your PostgreSQL database is running, then apply the Prisma schema to set up the database structure:
   ```bash
   cd backend
   npm run db:push
   
   # Optional: Populate initial seed data
   npm run db:seed 
   ```

### Running the Application Locally

1. **Start the Backend (API + Workers)**
   The backend uses `concurrently` to run both the Express API and the BullMQ worker process simultaneously.
   ```bash
   cd backend
   npm run dev
   ```
   - The Express API will be available at `http://localhost:4000`.
   - The Worker process will start processing background jobs via Redis.

2. **Start the Frontend**
   ```bash
   cd frontend
   npm run dev
   ```
   - The Next.js application will be available at `http://localhost:3000`.

## 🏗️ Architecture Notes

- **Decoupled API**: The system utilizes a standalone Express.js backend. The Next.js frontend acts strictly as a UI layer, making HTTP calls to the Express API rather than using Next.js API routes.
- **Event-Driven Chasing**: The chasing engine is event-driven. When an invoice is created or updated, the Express API emits domain events (e.g., `invoice.created`) which are captured by the Transactional Outbox. BullMQ workers then reliably process these outbox events to schedule and dispatch emails/SMS asynchronously.
- **Idempotency**: Critical operations like sending payment reminders or creating webhooks employ idempotency keys to ensure they are safely retriable without causing duplicate actions.

## 📄 License

Proprietary Software. All rights reserved.
