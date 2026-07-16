// Reports references and same-offset scalar operands for one or more addresses.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class ReportAddressReferences extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more addresses");
        }

        for (String text : args) {
            Address target = currentProgram.getAddressFactory().getAddress(text);
            if (target == null) {
                println("Invalid address: " + text);
                continue;
            }

            long segmentOffset = parseSegmentOffset(text, target);
            println("TARGET " + target + " segment-offset=" +
                Long.toHexString(segmentOffset));

            int referenceCount = 0;
            ReferenceIterator references =
                currentProgram.getReferenceManager().getReferencesTo(target);
            while (references.hasNext()) {
                Reference reference = references.next();
                printSite("xref " + reference.getReferenceType(),
                    reference.getFromAddress(), reference.getOperandIndex());
                referenceCount++;
            }
            println("  xrefs=" + referenceCount);

            int scalarCount = 0;
            InstructionIterator instructions =
                currentProgram.getListing().getInstructions(true);
            while (instructions.hasNext()) {
                Instruction instruction = instructions.next();
                for (int operand = 0; operand < instruction.getNumOperands(); operand++) {
                    for (Object object : instruction.getOpObjects(operand)) {
                        if (object instanceof Scalar &&
                            ((Scalar) object).getUnsignedValue() == segmentOffset) {
                            printSite("scalar", instruction.getAddress(), operand);
                            scalarCount++;
                        }
                    }
                }
            }
            println("  matching-scalars=" + scalarCount);
        }
    }

    private long parseSegmentOffset(String text, Address target) {
        int colon = text.lastIndexOf(':');
        if (colon >= 0) {
            return Long.parseLong(text.substring(colon + 1), 16);
        }
        return target.getOffset();
    }

    private void printSite(String kind, Address from, int operand) {
        Instruction instruction = getInstructionAt(from);
        Function function = getFunctionContaining(from);
        println("  " + kind + " from=" + from + " op=" + operand +
            " function=" + (function == null ? "<none>" : function.getName()) +
            " instruction=" + (instruction == null ? "<none>" : instruction.toString()));
    }
}
