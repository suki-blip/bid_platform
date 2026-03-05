"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Parameter {
  name: string;
  options: string[];
}

interface BidFile {
  id: string;
  filename: string;
}

interface Bid {
  id: string;
  title: string;
  description: string;
  deadline: string;
  parameters: Parameter[];
  files: BidFile[];
}

type PricingMode = "combination" | "additive";

interface CombinationRow {
  combination: Record<string, string>;
  combinationKey: string;
  price: string;
}

interface AdditiveRow {
  paramName: string;
  option: string;
  key: string;
  addition: string;
}

interface DiscountRule {
  id: string;
  conditionParam: string;
  conditionOption: string;
  targetType: "param_option" | "total";
  targetParam: string;
  targetOption: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
}

function generateCombinations(parameters: Parameter[]): Record<string, string>[] {
  if (parameters.length === 0) return [{}];
  const [first, ...rest] = parameters;
  const restCombinations = generateCombinations(rest);
  const results: Record<string, string>[] = [];
  for (const option of first.options) {
    for (const combo of restCombinations) {
      results.push({ [first.name]: option, ...combo });
    }
  }
  return results;
}

function makeCombinationKey(combo: Record<string, string>): string {
  const sorted = Object.keys(combo).sort().reduce((acc: Record<string, string>, key) => {
    acc[key] = combo[key];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

function makeAdditiveKey(paramName: string, option: string): string {
  return JSON.stringify({ param: paramName, option });
}

export default function VendorBidPage() {
  const params = useParams();
  const id = params.id as string;

  const [bid, setBid] = useState<Bid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [pricingMode, setPricingMode] = useState<PricingMode>("combination");
  const [combinationRows, setCombinationRows] = useState<CombinationRow[]>([]);
  const [additiveRows, setAdditiveRows] = useState<AdditiveRow[]>([]);
  const [basePrice, setBasePrice] = useState("");
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/bids/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bid");
        return res.json();
      })
      .then((data) => {
        setBid(data);
        const parameters: Parameter[] = data.parameters || [];

        // Combination rows
        const combos = generateCombinations(parameters);
        setCombinationRows(
          combos.map((combo) => ({
            combination: combo,
            combinationKey: makeCombinationKey(combo),
            price: "",
          }))
        );

        // Additive rows
        const addRows: AdditiveRow[] = [];
        for (const param of parameters) {
          for (const option of param.options) {
            addRows.push({
              paramName: param.name,
              option,
              key: makeAdditiveKey(param.name, option),
              addition: "",
            });
          }
        }
        setAdditiveRows(addRows);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const totalOptions = bid?.parameters?.reduce((sum, p) => sum + p.options.length, 0) ?? 0;
  const totalCombinations = combinationRows.length;

  const updateCombinationPrice = (index: number, value: string) => {
    const updated = [...combinationRows];
    updated[index] = { ...updated[index], price: value };
    setCombinationRows(updated);
  };

  const updateAdditiveAddition = (index: number, value: string) => {
    const updated = [...additiveRows];
    updated[index] = { ...updated[index], addition: value };
    setAdditiveRows(updated);
  };

  const addRule = () => {
    const firstParam = bid?.parameters?.[0];
    setRules([
      ...rules,
      {
        id: crypto.randomUUID(),
        conditionParam: firstParam?.name || "",
        conditionOption: firstParam?.options?.[0] || "",
        targetType: "total",
        targetParam: "",
        targetOption: "",
        discountType: "percentage",
        discountValue: "",
      },
    ]);
  };

  const updateRule = (index: number, updates: Partial<DiscountRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...updates };
    setRules(updated);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (pricingMode === "combination") {
        const prices = combinationRows
          .filter((r) => r.price !== "")
          .map((r) => ({
            combination_key: r.combinationKey,
            price: parseFloat(r.price),
          }));

        if (prices.length === 0) {
          throw new Error("Please enter at least one price");
        }

        const res = await fetch(`/api/bids/${id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_name: vendorName,
            pricing_mode: "combination",
            prices,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to submit prices");
        }
      } else {
        if (!basePrice) {
          throw new Error("Please enter a base price");
        }

        const prices = additiveRows
          .filter((r) => r.addition !== "")
          .map((r) => ({
            combination_key: r.key,
            price: parseFloat(r.addition),
          }));

        const serializedRules = rules
          .filter((r) => r.discountValue !== "")
          .map((r) => ({
            conditionParam: r.conditionParam,
            conditionOption: r.conditionOption,
            targetType: r.targetType,
            targetParam: r.targetParam,
            targetOption: r.targetOption,
            discountType: r.discountType,
            discountValue: parseFloat(r.discountValue),
          }));

        const res = await fetch(`/api/bids/${id}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor_name: vendorName,
            pricing_mode: "additive",
            base_price: parseFloat(basePrice),
            prices,
            rules: serializedRules.length > 0 ? serializedRules : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to submit prices");
        }
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </main>
    );
  }

  if (error && !bid) {
    return (
      <main className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
          <Link href="/vendor" className="text-sm text-indigo-500 hover:text-indigo-700 mt-4 inline-block">&larr; Back to Dashboard</Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-10 border border-gray-200 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Prices Submitted!</h2>
          <p className="text-gray-500 mb-6">Your prices have been successfully submitted.</p>
          <Link
            href="/vendor"
            className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Back to Vendor Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/vendor" className="text-sm text-indigo-500 hover:text-indigo-700 mb-4 inline-block">&larr; Back to Dashboard</Link>

        {/* Bid Info */}
        <div className="bg-white rounded-xl shadow p-6 border border-gray-200 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{bid?.title}</h1>
          <p className="text-gray-500 mt-2">{bid?.description}</p>
          <p className="text-sm text-gray-400 mt-2">Deadline: {bid ? new Date(bid.deadline).toLocaleDateString() : ""}</p>
        </div>

        {/* Attached Files */}
        {bid?.files && bid.files.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Attached Files</h2>
            <ul className="space-y-2">
              {bid.files.map((file) => (
                <li key={file.id}>
                  <a
                    href={`/api/bids/${id}/files/${file.id}`}
                    className="text-indigo-600 hover:text-indigo-800 text-sm underline"
                    download
                  >
                    {file.filename}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vendor Name */}
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Company Name</label>
            <input
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter your company name"
            />
          </div>

          {/* Pricing Mode Toggle */}
          {bid?.parameters && bid.parameters.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Pricing Mode</h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPricingMode("combination")}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                    pricingMode === "combination"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold">Combination</div>
                  <div className="text-xs mt-1 opacity-75">
                    Unique price per combination ({totalCombinations} prices)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode("additive")}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                    pricingMode === "additive"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold">Additive</div>
                  <div className="text-xs mt-1 opacity-75">
                    Base price + per-option additions ({totalOptions} prices)
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Combination Price Grid */}
          {pricingMode === "combination" && (
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Price Grid</h2>

              {combinationRows.length === 0 && (
                <p className="text-gray-400 text-sm">This bid has no parameters. No price grid to fill.</p>
              )}

              {combinationRows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {bid?.parameters?.map((p) => (
                          <th key={p.name} className="text-left py-3 px-2 font-medium text-gray-600">
                            {p.name}
                          </th>
                        ))}
                        <th className="text-left py-3 px-2 font-medium text-gray-600">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinationRows.map((row, index) => (
                        <tr key={index} className="border-b border-gray-100">
                          {bid?.parameters?.map((p) => (
                            <td key={p.name} className="py-2 px-2 text-gray-700">
                              {row.combination[p.name]}
                            </td>
                          ))}
                          <td className="py-2 px-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.price}
                              onChange={(e) => updateCombinationPrice(index, e.target.value)}
                              className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              placeholder="0.00"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Additive Pricing */}
          {pricingMode === "additive" && (
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Additive Pricing</h2>
              <p className="text-gray-400 text-sm mb-4">
                Set a base price, then specify how much each option adds to the total.
                Final price = base + sum of selected option additions.
              </p>

              {/* Base Price */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              {/* Per-option additions grouped by parameter */}
              {bid?.parameters?.map((param) => (
                <div key={param.name} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{param.name}</h3>
                  <div className="space-y-2">
                    {param.options.map((option) => {
                      const rowIndex = additiveRows.findIndex(
                        (r) => r.paramName === param.name && r.option === option
                      );
                      if (rowIndex === -1) return null;
                      return (
                        <div key={option} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 w-40">{option}</span>
                          <span className="text-gray-400 text-sm">+</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={additiveRows[rowIndex].addition}
                            onChange={(e) => updateAdditiveAddition(rowIndex, e.target.value)}
                            className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="0.00"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conditional Discount Rules */}
          {pricingMode === "additive" && bid?.parameters && bid.parameters.length > 1 && (
            <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Conditional Discounts</h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Optional: define discounts that apply when specific options are selected.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addRule}
                  className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium transition-colors"
                >
                  + Add Rule
                </button>
              </div>

              {rules.length === 0 && (
                <p className="text-gray-300 text-sm">No discount rules added.</p>
              )}

              <div className="space-y-4">
                {rules.map((rule, ruleIndex) => (
                  <div key={rule.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Rule {ruleIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeRule(ruleIndex)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Condition: When [param] is [option] */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-sm text-gray-600 font-medium">When</span>
                      <select
                        value={rule.conditionParam}
                        onChange={(e) => {
                          const param = bid.parameters.find((p) => p.name === e.target.value);
                          updateRule(ruleIndex, {
                            conditionParam: e.target.value,
                            conditionOption: param?.options?.[0] || "",
                          });
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {bid.parameters.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                      <span className="text-sm text-gray-600">=</span>
                      <select
                        value={rule.conditionOption}
                        onChange={(e) => updateRule(ruleIndex, { conditionOption: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {bid.parameters
                          .find((p) => p.name === rule.conditionParam)
                          ?.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                      </select>
                    </div>

                    {/* Target: Apply to [total / param option] */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-sm text-gray-600 font-medium">Then</span>
                      <select
                        value={rule.targetType}
                        onChange={(e) => {
                          const targetType = e.target.value as "total" | "param_option";
                          if (targetType === "total") {
                            updateRule(ruleIndex, { targetType, targetParam: "", targetOption: "" });
                          } else {
                            const otherParams = bid.parameters.filter((p) => p.name !== rule.conditionParam);
                            const first = otherParams[0];
                            updateRule(ruleIndex, {
                              targetType,
                              targetParam: first?.name || "",
                              targetOption: first?.options?.[0] || "",
                            });
                          }
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="total">total price</option>
                        <option value="param_option">specific option</option>
                      </select>

                      {rule.targetType === "param_option" && (
                        <>
                          <select
                            value={rule.targetParam}
                            onChange={(e) => {
                              const param = bid.parameters.find((p) => p.name === e.target.value);
                              updateRule(ruleIndex, {
                                targetParam: e.target.value,
                                targetOption: param?.options?.[0] || "",
                              });
                            }}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {bid.parameters
                              .filter((p) => p.name !== rule.conditionParam)
                              .map((p) => (
                                <option key={p.name} value={p.name}>{p.name}</option>
                              ))}
                          </select>
                          <span className="text-sm text-gray-600">=</span>
                          <select
                            value={rule.targetOption}
                            onChange={(e) => updateRule(ruleIndex, { targetOption: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {bid.parameters
                              .find((p) => p.name === rule.targetParam)
                              ?.options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                          </select>
                        </>
                      )}
                    </div>

                    {/* Discount: gets [amount] [% off / $ off] */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-600 font-medium">gets</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rule.discountValue}
                        onChange={(e) => updateRule(ruleIndex, { discountValue: e.target.value })}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                      <select
                        value={rule.discountType}
                        onChange={(e) => updateRule(ruleIndex, { discountType: e.target.value as "percentage" | "fixed" })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="percentage">% off</option>
                        <option value="fixed">$ off</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Prices"}
          </button>
        </form>
      </div>
    </main>
  );
}
