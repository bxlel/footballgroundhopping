import { HttpErrorResponse } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';
import { defer, NEVER, Observable, of, throwError, TimeoutError } from 'rxjs';
import { isTransient, resilient } from './resilient';

describe('resilient', () => {
  const OPTIONS = { timeoutMs: 1000, retries: 2, delayMs: 100 };
  const httpError = (status: number) => new HttpErrorResponse({ status });

  /** Flux qui échoue avec les erreurs données, puis réussit. */
  function flaky(errors: unknown[]): { source: Observable<string>; attempts: () => number } {
    let attempts = 0;
    const source = defer(() => {
      const error = errors[attempts++];
      return error === undefined ? of('ok') : throwError(() => error);
    });
    return { source, attempts: () => attempts };
  }

  it('distingue les pannes passagères des erreurs définitives', () => {
    expect(isTransient(httpError(0))).toBeTrue();
    expect(isTransient(httpError(503))).toBeTrue();
    expect(isTransient(httpError(429))).toBeTrue();
    expect(isTransient(new TimeoutError())).toBeTrue();
    expect(isTransient(httpError(404))).toBeFalse();
    expect(isTransient(httpError(400))).toBeFalse();
    expect(isTransient(new Error('bug'))).toBeFalse();
  });

  it('relance après une panne passagère, en espaçant les tentatives', fakeAsync(() => {
    const { source, attempts } = flaky([httpError(503), httpError(0)]);
    let result = '';
    source.pipe(resilient(OPTIONS)).subscribe((value) => (result = value));

    expect(attempts()).toBe(1);
    tick(100);
    expect(attempts()).toBe(2);
    tick(199);
    expect(attempts()).toBe(2);
    tick(1);
    expect(attempts()).toBe(3);
    expect(result).toBe('ok');
  }));

  it('abandonne après le nombre de relances prévu', fakeAsync(() => {
    const { source, attempts } = flaky([httpError(503), httpError(503), httpError(503)]);
    let failure: unknown;
    source.pipe(resilient(OPTIONS)).subscribe({ error: (error) => (failure = error) });
    tick(1000);
    expect(attempts()).toBe(3);
    expect((failure as HttpErrorResponse).status).toBe(503);
  }));

  it('ne relance pas une erreur définitive', fakeAsync(() => {
    const { source, attempts } = flaky([httpError(404)]);
    let failed = false;
    source.pipe(resilient(OPTIONS)).subscribe({ error: () => (failed = true) });
    tick(1000);
    expect(attempts()).toBe(1);
    expect(failed).toBeTrue();
  }));

  it('abandonne une tentative trop longue, puis l’ensemble', fakeAsync(() => {
    let failure: unknown;
    NEVER.pipe(resilient({ timeoutMs: 1000, retries: 1, delayMs: 100 })).subscribe({
      error: (error) => (failure = error),
    });
    tick(1000 + 100 + 999);
    expect(failure).toBeUndefined();
    tick(1);
    expect(failure instanceof TimeoutError).toBeTrue();
  }));
});
