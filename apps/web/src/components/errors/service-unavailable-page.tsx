import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function ServiceUnavailablePage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>503 - Service unavailable</EmptyTitle>
        <EmptyDescription>
          Our server is temporary unavailable. Please, try again later.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
