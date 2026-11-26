"use client";

import { createContext, useContext } from "react";

/**
 * Maps text for display. By default it changes nothing. When the person chooses to show their
 * original details, it swaps labels like [PERSON_1] back to the originals. Display only: it never
 * changes what was sent, and the originals stay in this browser.
 */
const RevealContext = createContext<(text: string) => string>((text) => text);

export const RevealProvider = RevealContext.Provider;
export const useReveal = () => useContext(RevealContext);
