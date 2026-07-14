# AI Game Master

A stateful AI-powered game-master assistant for 5e SRD-compatible fantasy tabletop play in Foundry VTT.

The project combines a Foundry VTT module with a Node.js and Express backend that connects to the Anthropic Claude API. It is designed to maintain campaign continuity across sessions by storing structured campaign, quest, NPC, objective, location, and world-state data outside the language model.

## Project Status

Active development and private testing.

Current functionality includes AI-assisted game-master responses, campaign and quest generation, persistent JSON memory, multilingual support, adaptive hint handling, and Foundry VTT chat commands.

## Core Features

- Foundry VTT chat integration
- Claude-powered game-master responses
- Persistent campaign memory across sessions
- Structured campaign, quest, NPC, and world-state storage
- Campaign history snapshots
- Location and objective tracking
- Multilingual response support
- Adaptive player hints with cooldowns
- Input validation and error handling
- Local backend service with CORS support
- 5e SRD-compatible fantasy positioning

## Supported Commands

The module includes commands for common game-master interactions:

- `/begin`
- `/quest`
- `/campaign`
- `/location`
- `/objective`
- `/rules`
- `/lore`
- `/ooc`
- `/hint`

## Architecture

```text
Foundry VTT Client
        |
        | HTTP requests
        v
Node.js / Express Backend
        |
        | Anthropic SDK
        v
Claude API
        |
        | Structured updates
        v
Local JSON Memory
```

### Foundry VTT Module

The Foundry module captures supported chat commands, sends player context to the backend, and returns the Keeper's response to the game chat.

### Backend Service

The backend uses:

- Node.js
- Express
- CORS
- dotenv
- Anthropic SDK

The backend validates incoming requests, builds the language-model context, calls Claude, and returns a structured response to Foundry.

### Persistent Memory

Campaign continuity is stored in local JSON files rather than relying only on the model's conversation window.

Current data categories include:

- Campaign structure
- Active quests
- NPC records
- Current location
- Current objective
- Completed objectives
- Major player choices
- Discovered locations
- Met NPCs
- Session notes
- Campaign history snapshots

## Technologies

- JavaScript
- Node.js
- Express
- Anthropic Claude API
- REST-style HTTP requests
- JSON
- Foundry VTT
- Git and GitHub

## Getting Started

### Prerequisites

- Node.js
- Foundry VTT v13
- An Anthropic API key
- A Foundry world for testing

### Clone the Repository

```bash
git clone https://github.com/andresmtz88/AI-Game-Master.git
cd AI-Game-Master
```

### Install Backend Dependencies

```bash
cd backend
npm install
```

### Configure Environment Variables

Create:

```text
backend/.env
```

Use:

```env
CLAUDE_API_KEY=your_private_anthropic_key
PORT=3000
```

Never commit the real `.env` file.

A safe public example can be stored as:

```text
backend/.env.example
```

with placeholder values only.

### Start the Backend

```bash
node server.js
```

The default service runs locally on:

```text
http://localhost:3000
```

### Install the Foundry Module

Copy or link the Foundry module folder into the Foundry VTT modules directory, enable it in the desired world, and ensure the backend is running before using chat commands.

## Security

- `backend/.env` is ignored by Git
- API keys remain local
- The repository Git history was scanned with Gitleaks and returned no leaks
- The local working directory correctly detected the private `.env`, confirming the scanner was functioning
- The Anthropic key should never be placed in source code, JSON files, screenshots, logs, or README examples

## Design Principles

- Preserve player agency
- Use a balanced heroic tone with realistic consequences
- Keep descriptions immersive but manageable
- Provide guidance without revealing every hidden detail
- Maintain consistent state across sessions
- Separate game data from model context
- Remain compatible with legally safe 5e SRD terminology

## Current Limitations

- Backend must run locally
- Voice narration is not yet implemented
- Data persistence currently uses local JSON rather than a database
- Multiplayer ownership and permission edge cases require additional testing
- Automated test coverage is still developing
- The project is not yet packaged for public distribution

## Planned Improvements

- Expand automated testing
- Improve configuration and installation workflow
- Add schema validation for JSON data
- Add database-backed persistence
- Improve user and permission handling
- Add configurable model settings
- Build campaign import and export tools
- Add optional voice narration
- Prepare a distributable Foundry VTT release package

## What This Project Demonstrates

- LLM application development
- Context and prompt design
- Persistent state architecture
- Backend API integration
- Structured data modeling
- Workflow orchestration
- Error handling and debugging
- Incremental feature development
- Human-AI interaction design

## Author

**Andres Martinez, M.D.**

Physician-trained healthcare operations professional building AI-enabled software, mobile applications, and workflow systems.

- GitHub: [andresmtz88](https://github.com/andresmtz88)
- LinkedIn: [andresmtz88](https://www.linkedin.com/in/andresmtz88/)

## License

The Foundry module metadata currently identifies the project under the MIT License. Review all included assets, dependencies, and SRD-compatible content before commercial distribution.
