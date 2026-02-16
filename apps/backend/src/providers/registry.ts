import type { MessengerProvider } from './types.js';

const providers = new Map<string, MessengerProvider>();

export function registerProvider(provider: MessengerProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): MessengerProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Messenger provider "${name}" is not registered`);
  }
  return provider;
}

export function getAllProviders(): MessengerProvider[] {
  return Array.from(providers.values());
}

export function hasProvider(name: string): boolean {
  return providers.has(name);
}
