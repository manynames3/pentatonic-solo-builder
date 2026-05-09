# Pentatonic Solo Builder

Cloudflare Pages web app that turns a lead sheet into melodic pentatonic guitar phrases and ASCII tab.

The default Cloudflare Pages Function generates deterministic, motif-based pentatonic solos locally. An optional AWS SAM endpoint can be connected for heavier model-backed processing.

## Local Development

Node `22.12.0` or newer is expected.

```bash
npm install
npm run dev
```

Vite runs the front end at `http://localhost:5173`. For a Cloudflare-like local run with Pages Functions:

```bash
npm run pages:dev
```

## Deploy To Cloudflare Pages

```bash
npm run build
npm run deploy
```

Build output: `dist`

Function endpoint: `/api/generate`

Optional environment variables:

- `AWS_SOLO_ENDPOINT`: POST endpoint that accepts the same JSON payload as `/api/generate`
- `AWS_SOLO_ENDPOINT_TOKEN`: bearer token sent to the AWS endpoint

## Accepted Input

Text-based lead sheets work locally: chord charts, ChordPro-style text, MusicXML/XML text, or pasted chord changes.

PDF and image uploads are passed through the request shape so an AWS parser/model endpoint can handle them. Without that endpoint, the app falls back to local generation and warns that binary parsing is not configured.

## Verify

```bash
npm test
npm run build
```
