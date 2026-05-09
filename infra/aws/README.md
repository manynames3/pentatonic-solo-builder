# Optional AWS Endpoint

This SAM app creates an HTTP endpoint that Pentatonic Solo Builder can call with `AWS_SOLO_ENDPOINT`.

It is optional. Without it, the Cloudflare Pages Function uses the local TypeScript solo generator.

## Deploy

```bash
cd infra/aws
npm install
npm run build
npm run deploy
```

Set the resulting `ApiEndpoint` as a Cloudflare Pages environment variable:

```bash
wrangler pages secret put AWS_SOLO_ENDPOINT
wrangler pages secret put AWS_SOLO_ENDPOINT_TOKEN
```

`BEDROCK_MODEL_ID` enables Amazon Bedrock generation. If it is blank, the endpoint stores uploads in S3 but returns `422`, causing the Cloudflare Function to fall back to local generation.
