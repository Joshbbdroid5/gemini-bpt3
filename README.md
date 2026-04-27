# Western Bingo - Vercel Deployment Guide

This application is built with **React**, **Vite**, and **Tailwind CSS**. It is ready for deployment on Vercel.

## Quick Start (Deploying to Vercel)

1.  **Push to GitHub**: Push this code to a GitHub repository.
2.  **Connect to Vercel**:
    *   Go to [vercel.com](https://vercel.com).
    *   Click "**New Project**".
    *   Import your GitHub repository.
3.  **Configure Build Settings**:
    *   **Framework Preset**: Vite
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist`
4.  **Environment Variables**:
    *   If you plan to use AI features or the Gemini API, add `GEMINI_API_KEY` to your Vercel Environment Variables in the project settings.
    *   Add `TELEGRAM_BOT_TOKEN` with your token from @BotFather to the Vercel Environment Variables.
5.  **Deploy**: Click "Deploy".

## Features
- Fully responsive Western-themed Bingo.
- 600 unique, deterministic boards.
- Live draw system with win detection.
- Game history log (saved per session).
- SEO-ready SPA structure with Vercel rewrites.

## Technical Notes
- **Routing**: The app uses a state-based phase system, but a `vercel.json` is included to handle potential SPA routing needs in the future.
- **Styling**: Built with Tailwind CSS v4.
- **Animations**: Powered by Framer Motion.
