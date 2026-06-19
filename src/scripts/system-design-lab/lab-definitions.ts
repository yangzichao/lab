import { chatMessagingLabDefinition } from './labs/chat-messaging-lab';
import { fileSyncLabDefinition } from './labs/file-sync-lab';
import { googleDocsLabDefinition } from './labs/google-docs-lab';
import { keyValueStoreLabDefinition } from './labs/kv-store-lab';
import { newsFeedLabDefinition } from './labs/news-feed-lab';
import { notificationSystemLabDefinition } from './labs/notification-system-lab';
import { onlineJudgeLabDefinition } from './labs/online-judge-lab';
import { paymentLedgerLabDefinition } from './labs/payment-ledger-lab';
import { rateLimiterLabDefinition } from './labs/rate-limiter-lab';
import { rideSharingLabDefinition } from './labs/ride-sharing-lab';
import { searchAutocompleteLabDefinition } from './labs/search-autocomplete-lab';
import { urlShortenerLabDefinition } from './labs/url-shortener-lab';
import { videoStreamingLabDefinition } from './labs/video-streaming-lab';
import { webCrawlerLabDefinition } from './labs/web-crawler-lab';
import type { SystemDesignLabDefinition } from './lab-types';

export const systemDesignLabDefinitions = [
  urlShortenerLabDefinition,
  rateLimiterLabDefinition,
  newsFeedLabDefinition,
  chatMessagingLabDefinition,
  notificationSystemLabDefinition,
  searchAutocompleteLabDefinition,
  webCrawlerLabDefinition,
  videoStreamingLabDefinition,
  fileSyncLabDefinition,
  rideSharingLabDefinition,
  keyValueStoreLabDefinition,
  paymentLedgerLabDefinition,
  googleDocsLabDefinition,
  onlineJudgeLabDefinition,
];

export const systemDesignLabDefinitionsById: Record<string, SystemDesignLabDefinition> =
  Object.fromEntries(systemDesignLabDefinitions.map((definition) => [definition.id, definition]));
