export const formatNgn = (amt: number): string => {
  return '₦' + Math.abs(amt).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
