import { useEffect, useState } from "react";
import type { EmployeeSheetColumnMap } from "../../domain/app";
import type { MemberConfig } from "../../domain/onboarding";
import {
  analyzeEmployeeSheetHeaders,
  fetchSpreadsheetMetadata,
  type SheetHeaderAnalysis
} from "../../services/sheets/metadata";
import {
  deriveDefaultSelections,
  type ColumnSelections
} from "./columnMapping";

interface EmployeeWorkbookStateOptions {
  accessToken?: string;
  taskLogUrl: string;
  activeSheetName: string;
  showColumnReview: boolean;
  authoritativeConfig: MemberConfig | null | undefined;
  initialColumnMap: EmployeeSheetColumnMap | undefined;
  reportError: (error: unknown) => void;
  clearError: () => void;
}

export function useEmployeeWorkbookState({
  accessToken,
  taskLogUrl,
  activeSheetName,
  showColumnReview,
  authoritativeConfig,
  initialColumnMap,
  reportError,
  clearError
}: EmployeeWorkbookStateOptions) {
  const [spreadsheetTitle, setSpreadsheetTitle] = useState("");
  const [sheetOptions, setSheetOptions] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [analysis, setAnalysis] = useState<SheetHeaderAnalysis | null>(null);
  const [selections, setSelections] = useState<ColumnSelections>({});
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!accessToken || !taskLogUrl.trim()) {
      setSheetOptions([]);
      return;
    }
    let cancelled = false;
    fetchSpreadsheetMetadata(taskLogUrl, accessToken)
      .then((metadata) => {
        if (cancelled) return;
        setSpreadsheetTitle(metadata.spreadsheetTitle);
        setSheetOptions(metadata.sheets);
      })
      .catch((metadataError) => {
        if (!cancelled) reportError(metadataError);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, reportError, taskLogUrl]);

  useEffect(() => {
    if (!showColumnReview || !accessToken) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    setAnalyzing(true);
    clearError();
    analyzeEmployeeSheetHeaders(
      { taskLogUrl, activeSheetName },
      accessToken
    )
      .then((result) => {
        if (cancelled) return;
        setAnalysis(result);
        setSelections(
          deriveDefaultSelections(
            result,
            authoritativeConfig?.acceptedColumnMap ??
              authoritativeConfig?.proposedColumnMap ??
              initialColumnMap
          )
        );
      })
      .catch((analysisError) => {
        if (!cancelled) reportError(analysisError);
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeSheetName,
    authoritativeConfig,
    clearError,
    initialColumnMap,
    reportError,
    showColumnReview,
    taskLogUrl
  ]);

  return {
    spreadsheetTitle,
    setSpreadsheetTitle,
    sheetOptions,
    setSheetOptions,
    analysis,
    setAnalysis,
    selections,
    setSelections,
    analyzing
  };
}
