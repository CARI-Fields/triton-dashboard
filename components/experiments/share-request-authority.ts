export type ShareRequestToken = symbol;

export class ShareRequestAuthority {
  private currentRequest: ShareRequestToken | null = null;

  issue(): ShareRequestToken {
    const request = Symbol("share-request");
    this.currentRequest = request;
    return request;
  }

  isCurrent(request: ShareRequestToken): boolean {
    return request === this.currentRequest;
  }

  invalidate(): void {
    this.currentRequest = null;
  }

  dispose(): void {
    this.invalidate();
  }
}
