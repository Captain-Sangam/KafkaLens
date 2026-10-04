/// <reference types="vite/client" />
import type { KafkaLensAPI } from '../../shared/api'
declare global {
  interface Window {
    api: KafkaLensAPI
  }
}
