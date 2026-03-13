interface DateRangeInput {
  dateFrom?: string;
  dateTo?: string;
}

interface DateRangeBounds {
  fromIso?: string;
  toIso?: string;
}

const toStartOfDayIso = (value: string): string => new Date(`${value}T00:00:00.000Z`).toISOString();

const toEndOfDayIso = (value: string): string => new Date(`${value}T23:59:59.999Z`).toISOString();

export const toDateRangeBounds = ({ dateFrom, dateTo }: DateRangeInput): DateRangeBounds => {
  return {
    fromIso: dateFrom ? toStartOfDayIso(dateFrom) : undefined,
    toIso: dateTo ? toEndOfDayIso(dateTo) : undefined
  };
};

export const isWithinDateRange = (
  timestampIso: string,
  bounds: DateRangeBounds
): boolean => {
  if (bounds.fromIso && timestampIso < bounds.fromIso) {
    return false;
  }

  if (bounds.toIso && timestampIso > bounds.toIso) {
    return false;
  }

  return true;
};
