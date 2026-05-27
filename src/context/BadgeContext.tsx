import React, { createContext, useContext, useState } from 'react';

type BadgeContextType = {
  myListBadge: boolean;
  setMyListBadge: (val: boolean) => void;
};

const BadgeContext = createContext<BadgeContextType>({
  myListBadge: false,
  setMyListBadge: () => {},
});

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [myListBadge, setMyListBadge] = useState(false);
  return (
    <BadgeContext.Provider value={{ myListBadge, setMyListBadge }}>
      {children}
    </BadgeContext.Provider>
  );
}

export function useBadge() {
  return useContext(BadgeContext);
}
