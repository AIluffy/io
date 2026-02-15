declare const BRAND: unique symbol;

export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

export type Revision = Brand<number, 'Revision'>;
export type ValueEpoch = Brand<number, 'ValueEpoch'>;

export function initialRevision(): Revision {
  return 0 as Revision;
}

export function initialEpoch(): ValueEpoch {
  return 0 as ValueEpoch;
}

export function staleEpoch(): ValueEpoch {
  return -1 as ValueEpoch;
}

export function nextRevision(revision: Revision): Revision {
  return (revision + 1) as Revision;
}

export function previousRevision(revision: Revision): Revision {
  return (revision - 1) as Revision;
}

export function nextEpoch(epoch: ValueEpoch): ValueEpoch {
  return (epoch + 1) as ValueEpoch;
}

export function previousEpoch(epoch: ValueEpoch): ValueEpoch {
  return (epoch - 1) as ValueEpoch;
}
