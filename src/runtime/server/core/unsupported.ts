/**
 * A verb a channel does not have. The method is **left out of the exported type**, so
 * it is a red line while typing, and it still exists at runtime so a call from plain
 * JavaScript hits a sentence instead of `x.edit is not a function`.
 *
 * The reason belongs in the message, not in a doc nobody reads, and two cases have to
 * be told apart in the wording:
 *
 * - the service cannot do it at all, so there is nothing here to build
 * - the service can, but only with **other credentials** than the ones held here
 *
 * What is never right is a third case: doing nothing and returning something that
 * looks like success.
 */
export function unsupported(channel: string, verb: string, reason: string) {
  return (): never => {
    throw new Error(`${channel} cannot ${verb}. ${reason}`)
  }
}
