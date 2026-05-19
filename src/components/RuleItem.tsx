import React from 'react';

export default function RuleItem({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-[10px] font-black text-indigo-600 border border-indigo-100">
        {number}
      </div>
      <p className="text-gray-600 text-sm font-medium leading-normal">{text}</p>
    </div>
  );
}

