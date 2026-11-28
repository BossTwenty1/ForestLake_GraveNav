/** Follow the database's retained interment slots, including removed records. */
export function hasAvailableBurialCapacity(graveType: string | null, reservedSlots: number | null | undefined): boolean {
  if (graveType === "mausoleum") return true;
  return graveType === "regular" && typeof reservedSlots === "number"
    && Number.isInteger(reservedSlots) && reservedSlots >= 0 && reservedSlots < 6;
}
