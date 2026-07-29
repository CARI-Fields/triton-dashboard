import ExperimentCompare from "@/components/experiments/ExperimentCompare";
import { parseCompareSearchParams } from "@/lib/experiments/compare-url";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string | string[];
    baseline?: string | string[];
  }>;
}) {
  const selection = parseCompareSearchParams(await searchParams);
  return <ExperimentCompare initialSelection={selection} />;
}
