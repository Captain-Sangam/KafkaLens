import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const [version, directory = 'apps/desktop/release'] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
  throw new Error('Usage: node scripts/generate-cask.mjs <version> [release directory]')
const architectures = ['arm64', 'x64']
const hashes = {}
for (const arch of architectures) {
  const path = `${directory}/KafkaLens-${version}-${arch}.dmg`
  if (!existsSync(path)) throw new Error(`Missing signed release artifact: ${path}`)
  hashes[arch] = createHash('sha256').update(readFileSync(path)).digest('hex')
}
mkdirSync(`${directory}/homebrew`, { recursive: true })
writeFileSync(
  `${directory}/homebrew/kafkalens.rb`,
  `cask "kafkalens" do\n  arch arm: "arm64", intel: "x64"\n  version "${version}"\n  sha256 arm: "${hashes.arm64}", intel: "${hashes.x64}"\n  url "https://github.com/Captain-Sangam/KafkaLens/releases/download/v#{version}/KafkaLens-#{version}-#{arch}.dmg"\n  name "KafkaLens"\n  desc "Kafka inspection and debugging desktop client"\n  homepage "https://github.com/Captain-Sangam/KafkaLens"\n  depends_on macos: ">= :ventura"\n  app "KafkaLens.app"\n  zap trash: "~/Library/Application Support/KafkaLens"\nend\n`
)
