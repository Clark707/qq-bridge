import { discoverDshListeningPorts } from '../src/dsh-client.js'

for (let index = 0; index < 20; index += 1) {
  const ports = discoverDshListeningPorts()
  process.stdout.write(`${JSON.stringify({ index, ports })}\n`)
  await new Promise((resolve) => setTimeout(resolve, 500))
}
