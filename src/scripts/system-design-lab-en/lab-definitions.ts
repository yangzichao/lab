import { agentOrchestrationLabDefinition } from './labs/agent-orchestration-lab';
import { chatMessagingLabDefinition } from './labs/chat-messaging-lab';
import { featureStoreLabDefinition } from './labs/feature-store-lab';
import { fileSyncLabDefinition } from './labs/file-sync-lab';
import { fraudDetectionLabDefinition } from './labs/fraud-detection-lab';
import { googleDocsLabDefinition } from './labs/google-docs-lab';
import { jobBoardLabDefinition } from './labs/job-board-lab';
import { keyValueStoreLabDefinition } from './labs/kv-store-lab';
import { llmInferenceLabDefinition } from './labs/llm-inference-lab';
import { llmTrainingInfraLabDefinition } from './labs/llm-training-infra-lab';
import { mlTrainingPipelineLabDefinition } from './labs/ml-training-pipeline-lab';
import { modelServingLabDefinition } from './labs/model-serving-lab';
import { newsFeedLabDefinition } from './labs/news-feed-lab';
import { notificationSystemLabDefinition } from './labs/notification-system-lab';
import { onlineJudgeLabDefinition } from './labs/online-judge-lab';
import { paymentLedgerLabDefinition } from './labs/payment-ledger-lab';
import { ragSystemLabDefinition } from './labs/rag-system-lab';
import { rateLimiterLabDefinition } from './labs/rate-limiter-lab';
import { recommendationSystemLabDefinition } from './labs/recommendation-system-lab';
import { rideSharingLabDefinition } from './labs/ride-sharing-lab';
import { rlhfPipelineLabDefinition } from './labs/rlhf-pipeline-lab';
import { searchAutocompleteLabDefinition } from './labs/search-autocomplete-lab';
import { urlShortenerLabDefinition } from './labs/url-shortener-lab';
import { videoStreamingLabDefinition } from './labs/video-streaming-lab';
import { webCrawlerLabDefinition } from './labs/web-crawler-lab';
import type { SystemDesignLabDefinition } from './lab-types';

export const systemDesignLabDefinitions = [
  // Core system design
  urlShortenerLabDefinition,
  rateLimiterLabDefinition,
  newsFeedLabDefinition,
  chatMessagingLabDefinition,
  notificationSystemLabDefinition,
  searchAutocompleteLabDefinition,
  jobBoardLabDefinition,
  webCrawlerLabDefinition,
  videoStreamingLabDefinition,
  fileSyncLabDefinition,
  rideSharingLabDefinition,
  keyValueStoreLabDefinition,
  paymentLedgerLabDefinition,
  googleDocsLabDefinition,
  onlineJudgeLabDefinition,
  // ML systems
  recommendationSystemLabDefinition,
  featureStoreLabDefinition,
  modelServingLabDefinition,
  fraudDetectionLabDefinition,
  mlTrainingPipelineLabDefinition,
  // LLM systems (training infra + agents)
  llmTrainingInfraLabDefinition,
  llmInferenceLabDefinition,
  ragSystemLabDefinition,
  rlhfPipelineLabDefinition,
  agentOrchestrationLabDefinition,
];

export const systemDesignLabDefinitionsById: Record<string, SystemDesignLabDefinition> =
  Object.fromEntries(systemDesignLabDefinitions.map((definition) => [definition.id, definition]));
